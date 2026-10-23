import {useEffect, useRef, useState} from 'react';
import {AppState} from 'react-native';
import NetInfo, {NetInfoState} from '@react-native-community/netinfo';
import {Tab} from '../types';

type UseNetworkSyncOptions = {
  token: string | null;
  userId: number | string | undefined;
  tab: Tab;
  syncAndRefresh: (notify?: boolean) => Promise<void>;
  loadCommunity: () => Promise<void>;
  markDisconnected: () => void;
};

export default function useNetworkSync({token, userId, tab, syncAndRefresh, loadCommunity, markDisconnected}: UseNetworkSyncOptions) {
  const [hasInternet, setHasInternet] = useState(false);
  const [networkConnected, setNetworkConnected] = useState(false);
  const activeTab = useRef(tab);
  activeTab.current = tab;

  useEffect(() => {
    if (!token || !userId) {
      setHasInternet(false);
      setNetworkConnected(false);
      markDisconnected();
      return undefined;
    }

    let active = true;
    const recover = async (state?: NetInfoState) => {
      const net = state || (await NetInfo.fetch());
      // A phone can still reach a nearby SRA server over Wi-Fi when that Wi-Fi
      // has no internet route. Server requests determine actual reachability.
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
        markDisconnected();
      }
    };

    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected === true) {
        recover(state).catch(() => undefined);
      } else {
        setNetworkConnected(false);
        setHasInternet(false);
        markDisconnected();
      }
    });
    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        recover().catch(() => undefined);
      }
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') {
        recover().catch(() => undefined);
      }
    }, 30000);
    recover().catch(() => undefined);

    return () => {
      active = false;
      unsubscribe();
      appStateSubscription.remove();
      clearInterval(timer);
    };
  }, [token, userId, syncAndRefresh, loadCommunity, markDisconnected]);

  useEffect(() => {
    if (tab === 'community' && token && networkConnected) {
      loadCommunity().catch(() => undefined);
    } else if (tab === 'community' && !networkConnected) {
      markDisconnected();
    }
  }, [tab, token, networkConnected, loadCommunity, markDisconnected]);

  return {hasInternet, networkConnected};
}
