import {useCallback, useEffect, useState} from 'react';
import {apiRequest, AuthResponse, Farmer} from '../api';
import {readSecure, readSecureJson, removeSecure, writeSecure, writeSecureJson} from '../secureStorage';

export default function useFarmerSession(onMessage: (message: string) => void) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<Farmer | null>(null);
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const [savedToken, savedUser] = await Promise.all([
          readSecure('session-token'),
          readSecureJson<Farmer | null>('session-user', null),
        ]);
        // Remove the server address saved by older versions. The API endpoint is
        // an app configuration detail and is never shown or changed by users.
        await removeSecure('api-base-url').catch(() => undefined);
        if (mounted && savedToken && savedUser) {
          setToken(savedToken);
          setUser(savedUser);
        }
      } catch {
        if (mounted) {
          onMessage('Could not open saved app data. Sign in to continue.');
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
  }, [onMessage]);

  const applyAuth = useCallback(async (auth: AuthResponse) => {
    const authenticatedUser = {
      ...auth.user,
      profile_photo_cache_key: user?.id === auth.user.id && user.profile_photo_url === auth.user.profile_photo_url
        ? user.profile_photo_cache_key
        : undefined,
    };
    setToken(auth.access_token);
    setUser(authenticatedUser);
    await Promise.all([
      writeSecure('session-token', auth.access_token),
      writeSecureJson('session-user', authenticatedUser),
    ]);
  }, [user]);

  const signOut = useCallback(async (networkConnected: boolean) => {
    if (token && networkConnected) {
      await apiRequest('/auth/logout', token, {method: 'POST'}).catch(() => undefined);
    }
    await Promise.all([removeSecure('session-token'), removeSecure('session-user')]);
    setToken(null);
    setUser(null);
  }, [token]);

  return {token, user, setUser, appReady, applyAuth, signOut};
}
