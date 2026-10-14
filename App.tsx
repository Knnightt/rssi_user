import React, {useCallback, useEffect, useRef, useState} from 'react';
import {AppState, StatusBar} from 'react-native';
import NetInfo, {NetInfoState} from '@react-native-community/netinfo';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {configureApiBaseUrl, getConfiguredApiBaseUrl} from './src/config';
import {apiRequest, ApiError, AuthResponse, CommunityUpdate, FarmProperty, Farmer, FieldReport} from './src/api';
import {QueuedReport, readCache, readQueue, syncQueue, writeCache, writeQueue} from './src/reportQueue';
import {readSecure, readSecureJson, removeSecure, writeSecure, writeSecureJson} from './src/secureStorage';
import {Tab} from './src/types';
import AuthScreen, {LoadingScreen} from './src/screens/AuthScreen';
import FarmerShell from './src/screens/FarmerShell';

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <RSSIApp />
    </SafeAreaProvider>
  );
}

function RSSIApp() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<Farmer | null>(null);
  const [properties, setProperties] = useState<FarmProperty[]>([]);
  const [reports, setReports] = useState<FieldReport[]>([]);
  const [queue, setQueue] = useState<QueuedReport[]>([]);
  const [community, setCommunity] = useState<CommunityUpdate[]>([]);
  const [tab, setTab] = useState<Tab>('home');
  const [hasInternet, setHasInternet] = useState(false);
  const [networkConnected, setNetworkConnected] = useState(false);
  const [serverReachable, setServerReachable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [appReady, setAppReady] = useState(false);
  const [apiBaseUrl, setApiBaseUrl] = useState(getConfiguredApiBaseUrl());
  const syncLock = useRef(false);
  const activeTab = useRef(tab);
  activeTab.current = tab;
  const userId = user?.id;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [savedToken, savedUser, savedApiBaseUrl] = await Promise.all([
          readSecure('session-token'),
          readSecureJson<Farmer | null>('session-user', null),
          readSecure('api-base-url'),
        ]);
        if (savedApiBaseUrl) {
          try {
            setApiBaseUrl(configureApiBaseUrl(savedApiBaseUrl));
          } catch {
            // A stale invalid value must not prevent the farmer from opening the app.
          }
        }
        if (!mounted) {
          return;
        }
        if (savedToken && savedUser) {
          setToken(savedToken);
          setUser(savedUser);
          const [cache, pending] = await Promise.all([readCache(savedUser.id), readQueue(savedUser.id)]);
          if (!mounted) {
            return;
          }
          if (cache) {
            setProperties(cache.properties);
            setReports(cache.reports);
          }
          setQueue(pending);
        }
      } catch {
        if (mounted) {
          setNotice('Could not open saved app data. Sign in to continue.');
        }
      } finally {
        if (mounted) {
          setAppReady(true);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const applyAuth = useCallback(async (auth: AuthResponse) => {
    setToken(auth.access_token);
    setUser(auth.user);
    await Promise.all([writeSecure('session-token', auth.access_token), writeSecureJson('session-user', auth.user)]);
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
    setTab('home');
    setNotice('Welcome to RSSI. Your dashboard will show your saved farm and reports.');
  }, []);

  const saveApiBaseUrl = useCallback(async (value: string) => {
    const configured = configureApiBaseUrl(value);
    await writeSecure('api-base-url', configured);
    setApiBaseUrl(configured);
  }, []);

  const updateFarmerName = useCallback(async (name: string) => {
    if (!token || !user) {
      throw new Error('Sign in again before editing your profile.');
    }
    const response = await apiRequest<{user: Farmer}>('/me', token, {
      method: 'PATCH',
      body: JSON.stringify({name}),
    });
    setUser(response.user);
    await writeSecureJson('session-user', response.user);
    const cache = await readCache(user.id);
    if (cache) {
      await writeCache(user.id, {...cache, user: response.user, refreshedAt: new Date().toISOString()});
    }
  }, [token, user]);

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
      const currentUser = profile.user;
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
        setNotice('Your session has expired. Sign in again to sync reports.');
      }
      throw error;
    }
  }, [token, userId]);

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
        setNotice('Your saved reports have synced with RSSI.');
      } else if (notify && remaining.length > 0) {
        setNotice(`${remaining.length} report${remaining.length === 1 ? '' : 's'} waiting to sync. RSSI will retry automatically.`);
      }
    } catch (error) {
      if (notify && error instanceof Error && error.message) {
        setNotice(error.message);
      }
    } finally {
      syncLock.current = false;
      setBusy(false);
    }
  }, [token, userId, refreshFromServer]);

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
      setNotice('Community updates could not reach the RSSI server.');
    }
  }, [token]);

  useEffect(() => {
    if (!token || !userId) {
      setHasInternet(false);
      setNetworkConnected(false);
      setServerReachable(false);
      return undefined;
    }
    let active = true;
    const recover = async (state?: NetInfoState) => {
      const net = state || (await NetInfo.fetch());
      // A phone can still reach a nearby SRA server over Wi-Fi when that Wi-Fi
      // has no internet route. Server requests below determine actual reachability.
      const connected = net.isConnected === true;
      const internetAvailable = connected && net.isInternetReachable !== false;
      if (!active) {
        return;
      }
      setNetworkConnected(connected);
      setHasInternet(internetAvailable);
      if (connected) {
        await syncAndRefresh();
        if (activeTab.current === 'community') {
          await loadCommunity();
        }
      } else {
        setNetworkConnected(false);
        setHasInternet(false);
        setServerReachable(false);
        setCommunity([]);
      }
    };
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected === true) {
        void recover(state);
      } else {
        setNetworkConnected(false);
        setHasInternet(false);
        setServerReachable(false);
        setCommunity([]);
      }
    });
    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        void recover();
      }
    });
    const timer = setInterval(() => void recover(), 30000);
    void recover();
    return () => {
      active = false;
      unsubscribe();
      appStateSubscription.remove();
      clearInterval(timer);
    };
  }, [token, userId, syncAndRefresh, loadCommunity]);

  useEffect(() => {
    if (tab === 'community' && token && networkConnected) {
      void loadCommunity();
    } else if (tab === 'community' && !networkConnected) {
      setCommunity([]);
    }
  }, [tab, token, networkConnected, loadCommunity]);

  const signOut = useCallback(async () => {
    if (token && networkConnected) {
      await apiRequest('/auth/logout', token, {method: 'POST'}).catch(() => undefined);
    }
    await Promise.all([removeSecure('session-token'), removeSecure('session-user')]);
    setToken(null);
    setUser(null);
    setProperties([]);
    setReports([]);
    setQueue([]);
    setCommunity([]);
    setTab('home');
    setNotice('');
  }, [token, networkConnected]);

  if (!appReady) {
    return <LoadingScreen />;
  }

  if (!token || !user) {
    return (
      <AuthScreen
        onAuthenticated={applyAuth}
        serverUrl={apiBaseUrl}
        onServerConfigured={saveApiBaseUrl}
        onMessage={setNotice}
        initialMessage={notice}
      />
    );
  }

  return (
    <FarmerShell
      user={user}
      properties={properties}
      reports={reports}
      queue={queue}
      community={community}
      tab={tab}
      setTab={value => {
        setNotice('');
        setTab(value);
      }}
      hasInternet={hasInternet}
      networkConnected={networkConnected}
      serverReachable={serverReachable}
      busy={busy}
      notice={notice}
      clearNotice={() => setNotice('')}
      onMessage={setNotice}
      token={token}
      onReportQueued={async item => {
        const next = [...await readQueue(user.id), item];
        setQueue(next);
        await writeQueue(user.id, next);
        setTab('history');
        setNotice('Saved on this device. RSSI will submit it automatically when the server is reachable.');
        if (networkConnected) {
          await syncAndRefresh(true);
        }
      }}
      onSync={() => syncAndRefresh(true)}
      onRefresh={refreshFromServer}
      onLoadCommunity={loadCommunity}
      onSignOut={signOut}
      onChangeServer={async () => {
        if (token && networkConnected) {
          await apiRequest('/auth/logout', token, {method: 'POST'}).catch(() => undefined);
        }
        await Promise.all([removeSecure('session-token'), removeSecure('session-user')]);
        setToken(null);
        setUser(null);
        setProperties([]);
        setReports([]);
        setQueue([]);
        setCommunity([]);
        setTab('home');
        setNotice('Enter the new RSSI server address and sign in. Any saved offline reports remain on this device.');
      }}
      onUpdateFarmerName={updateFarmerName}
      onCommunityConfirmed={async id => {
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
          setNotice(error instanceof Error ? error.message : 'Could not send your community response.');
        }
      }}
    />
  );
}

export default App;
