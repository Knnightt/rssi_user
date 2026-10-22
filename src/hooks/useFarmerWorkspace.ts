import {useCallback, useEffect, useRef, useState} from 'react';
import {apiRequest, ApiError, AuthResponse, CommunityUpdate, FarmProperty, Farmer, FieldReport} from '../api';
import {QueuedReport, readCache, readQueue, syncQueue, writeCache, writeQueue} from '../reportQueue';
import {writeSecureJson} from '../secureStorage';

export default function useFarmerWorkspace(
  token: string | null,
  user: Farmer | null,
  setUser: (user: Farmer | null) => void,
  onMessage: (message: string) => void,
) {
  const [properties, setProperties] = useState<FarmProperty[]>([]);
  const [reports, setReports] = useState<FieldReport[]>([]);
  const [queue, setQueue] = useState<QueuedReport[]>([]);
  const [community, setCommunity] = useState<CommunityUpdate[]>([]);
  const [serverReachable, setServerReachable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hydratedUserId, setHydratedUserId] = useState<number | null>(null);
  const syncLock = useRef(false);
  const userId = user?.id;

  useEffect(() => {
    let active = true;

    if (!userId) {
      setProperties([]);
      setReports([]);
      setQueue([]);
      setCommunity([]);
      setServerReachable(false);
      setHydratedUserId(null);
      return () => {
        active = false;
      };
    }

    (async () => {
      try {
        const [cache, pending] = await Promise.all([readCache(userId), readQueue(userId)]);
        if (!active) {
          return;
        }
        if (cache) {
          setProperties(cache.properties);
          setReports(cache.reports);
        }
        setQueue(pending);
        setHydratedUserId(userId);
      } catch {
        if (active) {
          setHydratedUserId(userId);
          onMessage('Could not open saved app data. Sign in to continue.');
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [userId, onMessage]);

  const prepareAuthenticatedUser = useCallback(async (auth: AuthResponse) => {
    setQueue(await readQueue(auth.user.id));
    if (auth.properties) {
      setProperties(auth.properties);
      await writeCache(auth.user.id, {
        user: auth.user,
        properties: auth.properties,
        reports: [],
        refreshedAt: new Date().toISOString(),
      });
    }
    setHydratedUserId(auth.user.id);
  }, []);

  const updateFarmerName = useCallback(async (name: string) => {
    if (!token || !user) {
      throw new Error('Sign in again before editing your profile.');
    }
    const response = await apiRequest<{user: Farmer}>('/me', token, {
      method: 'PATCH',
      body: JSON.stringify({name}),
    });
    const updatedUser = {
      ...response.user,
      profile_photo_cache_key: response.user.profile_photo_url === user.profile_photo_url
        ? user.profile_photo_cache_key
        : undefined,
    };
    setUser(updatedUser);
    await writeSecureJson('session-user', updatedUser);
    const cache = await readCache(user.id);
    if (cache) {
      await writeCache(user.id, {...cache, user: updatedUser, refreshedAt: new Date().toISOString()});
    }
  }, [token, user, setUser]);

  const updateFarmerPhoto = useCallback(async (profilePhotoUrl: string | null) => {
    if (!user) {
      return;
    }
    const updatedUser = {
      ...user,
      profile_photo_url: profilePhotoUrl,
      profile_photo_cache_key: String(Date.now()),
    };
    setUser(updatedUser);
    await writeSecureJson('session-user', updatedUser);
    const cache = await readCache(user.id);
    if (cache) {
      await writeCache(user.id, {...cache, user: updatedUser, refreshedAt: new Date().toISOString()});
    }
  }, [user, setUser]);

  const refreshFromServer = useCallback(async () => {
    if (!token || !userId) {
      return;
    }
    try {
      const [profile, farmResponse, reportResponse] = await Promise.all([
        apiRequest<{user: Farmer}>('/me', token),
        apiRequest<{data: FarmProperty[]}>('/farmers/me/properties', token),
        apiRequest<{data: FieldReport[]}>('/farmers/me/reports', token),
      ]);
      const currentUser = {
        ...profile.user,
        profile_photo_cache_key: profile.user.profile_photo_url === user?.profile_photo_url
          ? user.profile_photo_cache_key
          : undefined,
      };
      const farmData = farmResponse.data || [];
      const reportData = reportResponse.data || [];
      setUser(currentUser);
      setProperties(farmData);
      setReports(reportData);
      setServerReachable(true);
      await Promise.all([
        writeSecureJson('session-user', currentUser),
        writeCache(currentUser.id, {
          user: currentUser,
          properties: farmData,
          reports: reportData,
          refreshedAt: new Date().toISOString(),
        }),
      ]);
    } catch (error) {
      setServerReachable(false);
      if (error instanceof ApiError && error.status === 401) {
        onMessage('Your session has expired. Sign in again to sync reports.');
      }
      throw error;
    }
  }, [token, userId, user, setUser, onMessage]);

  const syncAndRefresh = useCallback(async (notify = false) => {
    if (!token || !userId || syncLock.current) {
      return;
    }
    syncLock.current = true;
    setBusy(true);
    try {
      const hadQueuedReports = (await readQueue(userId)).length > 0;
      const remaining = await syncQueue(userId, token);
      setQueue(remaining);
      await refreshFromServer();
      setServerReachable(true);
      if (notify && hadQueuedReports && remaining.length === 0) {
        onMessage('Your saved reports have synced with RSSI.');
      } else if (notify && remaining.length > 0) {
        onMessage(`${remaining.length} report${remaining.length === 1 ? '' : 's'} waiting to sync. RSSI will retry automatically.`);
      }
    } catch (error) {
      if (notify && error instanceof Error && error.message) {
        onMessage(error.message);
      }
    } finally {
      syncLock.current = false;
      setBusy(false);
    }
  }, [token, userId, refreshFromServer, onMessage]);

  const loadCommunity = useCallback(async () => {
    if (!token) {
      setCommunity([]);
      return;
    }
    try {
      const response = await apiRequest<{data: CommunityUpdate[]}>('/farmers/me/community/updates', token);
      setCommunity(response.data || []);
      setServerReachable(true);
    } catch {
      setCommunity([]);
      setServerReachable(false);
      onMessage('Community updates could not reach the RSSI server.');
    }
  }, [token, onMessage]);

  const enqueueReport = useCallback(async (item: QueuedReport) => {
    if (!user) {
      throw new Error('Sign in again before submitting a report.');
    }
    const next = [...await readQueue(user.id), item];
    setQueue(next);
    await writeQueue(user.id, next);
  }, [user]);

  const confirmCommunityUpdate = useCallback(async (id: number | string) => {
    if (!token) {
      return;
    }
    try {
      const result = await apiRequest<{confirmation_count: number; confirmed_by_me: boolean}>(
        `/farmers/me/community/reports/${id}/confirm`,
        token,
        {method: 'POST'},
      );
      setCommunity(current => current.map(item => item.id === id ? {
        ...item,
        confirmation_count: result.confirmation_count,
        confirmed_by_me: result.confirmed_by_me,
      } : item));
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'Could not send your community response.');
    }
  }, [token, onMessage]);

  const markDisconnected = useCallback(() => {
    setCommunity([]);
    setServerReachable(false);
  }, []);

  const clearWorkspace = useCallback(() => {
    setProperties([]);
    setReports([]);
    setQueue([]);
    setCommunity([]);
    setServerReachable(false);
  }, []);

  return {
    properties,
    reports,
    queue,
    community,
    serverReachable,
    busy,
    isReady: userId === hydratedUserId,
    prepareAuthenticatedUser,
    updateFarmerName,
    updateFarmerPhoto,
    refreshFromServer,
    syncAndRefresh,
    loadCommunity,
    markDisconnected,
    enqueueReport,
    confirmCommunityUpdate,
    clearWorkspace,
  };
}
