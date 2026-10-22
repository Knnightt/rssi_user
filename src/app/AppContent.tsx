import React, {useCallback, useState} from 'react';
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
    isReady: workspaceReady,
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
    setTab('home');
    setNotice('Welcome to RSSI. Your dashboard will show your saved farm and reports.');
  }, [prepareAuthenticatedUser, applyAuth]);

  const changeTab = useCallback((value: Tab) => {
    setNotice('');
    setTab(value);
  }, []);

  const signOut = useCallback(async () => {
    await signOutSession(connectivity.networkConnected);
    clearWorkspace();
    setTab('home');
    setNotice('');
  }, [signOutSession, connectivity.networkConnected, clearWorkspace]);

  const handleReportQueued = useCallback(async (item: QueuedReport) => {
    if (!user) {
      return;
    }
    await enqueueReport(item);
    setTab('history');
    setNotice('Saved on this device. RSSI will submit it automatically when the server is reachable.');
    if (connectivity.networkConnected) {
      await syncAndRefresh(true);
    }
  }, [user, enqueueReport, connectivity.networkConnected, syncAndRefresh]);

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
      hasInternet={connectivity.hasInternet}
      networkConnected={connectivity.networkConnected}
      serverReachable={serverReachable}
      busy={busy}
      notice={notice}
      clearNotice={() => setNotice('')}
      onMessage={setNotice}
      token={token}
      onReportQueued={handleReportQueued}
      onSync={() => syncAndRefresh(true)}
      onRefresh={refreshFromServer}
      onLoadCommunity={loadCommunity}
      onSignOut={signOut}
      onUpdateFarmerName={updateFarmerName}
      onProfilePhotoUpdated={updateFarmerPhoto}
      onCommunityConfirmed={confirmCommunityUpdate}
    />
  );
}
