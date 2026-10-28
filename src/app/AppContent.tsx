import React, {useCallback, useRef, useState} from 'react';
import {AuthResponse} from '../api';
import {QueuedReport} from '../reportQueue';
import {Tab} from '../types';
import AuthScreen, {LoadingScreen} from '../screens/AuthScreen';
import FarmerShell from '../screens/FarmerShell';
import useFarmerSession from '../hooks/useFarmerSession';
import useFarmerWorkspace from '../hooks/useFarmerWorkspace';
import useNetworkSync from '../hooks/useNetworkSync';

export default function AppContent() {
  const [tab, setTab] = useState<Tab>('home');
  const tabHistory = useRef<Tab[]>([]);
  const [notice, setNotice] = useState('');
  const session = useFarmerSession(setNotice);
  const {
    token,
    user,
    setUser,
    appReady,
    applyAuth,
    signOut: signOutSession,
  } = session;
  const workspace = useFarmerWorkspace(token, user, setUser, setNotice);
  const {
    properties,
    reports,
    queue,
    community,
    serverReachable,
    busy,
    photoUploadProgress,
    isReady: workspaceReady,
    prepareAuthenticatedUser,
    updateFarmerName,
    updateFarmerPhoto,
    refreshFromServer,
    syncAndRefresh,
    loadCommunity,
    markDisconnected,
    enqueueReport,
    retryPhoto,
    confirmCommunityUpdate,
    clearWorkspace,
  } = workspace;
  const connectivity = useNetworkSync({
    token,
    userId: user?.id,
    tab,
    syncAndRefresh,
    loadCommunity,
    markDisconnected,
  });

  const applyAuthentication = useCallback(async (auth: AuthResponse) => {
    await prepareAuthenticatedUser(auth);
    await applyAuth(auth);
    tabHistory.current = [];
    setTab('home');
    setNotice('Welcome to RSSI. Your dashboard will show your saved farm and reports.');
  }, [prepareAuthenticatedUser, applyAuth]);

  const changeTab = useCallback((value: Tab) => {
    if (value !== tab) tabHistory.current.push(tab);
    setNotice('');
    setTab(value);
  }, [tab]);

  const goBack = useCallback(() => {
    const previousTab = tabHistory.current.pop();
    setNotice('');
    setTab(previousTab || 'home');
  }, []);

  const refreshCurrentScreen = useCallback(async () => {
    await refreshFromServer();
    if (tab === 'community') {
      await loadCommunity();
    }
  }, [refreshFromServer, loadCommunity, tab]);

  const signOut = useCallback(async () => {
    await signOutSession(connectivity.networkConnected);
    clearWorkspace();
    tabHistory.current = [];
    setTab('home');
    setNotice('');
  }, [signOutSession, connectivity.networkConnected, clearWorkspace]);

  const handleReportQueued = useCallback(async (item: QueuedReport) => {
    if (!user) {
      return;
    }
    await enqueueReport(item);
    changeTab('history');
    setNotice('Saved on this device. RSSI will submit it automatically when the server is reachable.');
    if (connectivity.networkConnected) {
      await syncAndRefresh(true);
    }
  }, [user, enqueueReport, connectivity.networkConnected, syncAndRefresh, changeTab]);

  if (!appReady || (user && !workspaceReady)) {
    return <LoadingScreen />;
  }

  if (!token || !user) {
    return <AuthScreen onAuthenticated={applyAuthentication} onMessage={setNotice} initialMessage={notice} />;
  }

  return (
    <FarmerShell
      user={user}
      properties={properties}
      reports={reports}
      queue={queue}
      community={community}
      tab={tab}
      setTab={changeTab}
      onBack={goBack}
      canGoBack={tabHistory.current.length > 0}
      hasInternet={connectivity.hasInternet}
      networkConnected={connectivity.networkConnected}
      serverReachable={serverReachable}
      busy={busy}
      photoUploadProgress={photoUploadProgress}
      notice={notice}
      clearNotice={() => setNotice('')}
      onMessage={setNotice}
      token={token}
      onReportQueued={handleReportQueued}
      onRetryPhoto={retryPhoto}
      onSync={() => syncAndRefresh(true)}
      onRefresh={refreshCurrentScreen}
      onLoadCommunity={loadCommunity}
      onSignOut={signOut}
      onUpdateFarmerName={updateFarmerName}
      onProfilePhotoUpdated={updateFarmerPhoto}
      onCommunityConfirmed={confirmCommunityUpdate}
    />
  );
}
