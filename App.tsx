import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import NetInfo, {NetInfoState} from '@react-native-community/netinfo';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import {WebView} from 'react-native-webview';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {captureFarmCoordinates, FarmCoordinates} from './src/location';
import {configureApiBaseUrl, getConfiguredApiBaseUrl} from './src/config';
import {
  apiRequest,
  ApiError,
  AuthResponse,
  CommunityUpdate,
  FarmProperty,
  Farmer,
  FieldReport,
  getApiBaseUrl,
} from './src/api';
import {
  createId,
  QueuedPhoto,
  QueuedReport,
  readCache,
  readQueue,
  storePhoto,
  syncQueue,
  writeCache,
  writeQueue,
} from './src/reportQueue';
import {readSecure, readSecureJson, removeSecure, writeSecure, writeSecureJson} from './src/secureStorage';

const C = {
  blue: '#2458D8',
  blueDark: '#163C9B',
  green: '#16834A',
  greenSoft: '#EAF7EF',
  ink: '#17233B',
  muted: '#71809A',
  line: '#E0E7F0',
  paper: '#FFFFFF',
  background: '#F4F6FB',
  paleBlue: '#EDF3FF',
  amber: '#A86A00',
  amberSoft: '#FFF5DB',
  red: '#B83B42',
  redSoft: '#FFF0F0',
};

type Tab = 'home' | 'farms' | 'map' | 'report' | 'history' | 'community' | 'profile';
type RegisterFields = {
  name: string;
  email: string;
  password: string;
  propertyName: string;
  province: string;
  municipality: string;
  barangay: string;
  sizeHectares: string;
};

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

function AuthScreen({
  onAuthenticated,
  serverUrl,
  onServerConfigured,
  onMessage,
  initialMessage,
}: {
  onAuthenticated: (auth: AuthResponse) => Promise<void>;
  serverUrl: string;
  onServerConfigured: (url: string) => Promise<void>;
  onMessage: (message: string) => void;
  initialMessage: string;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [serverAddress, setServerAddress] = useState(serverUrl);
  const [fields, setFields] = useState<RegisterFields>({
    name: '', email: '', password: '', propertyName: '', province: 'Negros Oriental',
    municipality: '', barangay: '', sizeHectares: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialMessage);
  const [consent, setConsent] = useState(false);
  const [preciseLocationConsent, setPreciseLocationConsent] = useState(false);
  const [coordinates, setCoordinates] = useState<FarmCoordinates | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const isRegistering = mode === 'register';

  const setField = (key: keyof RegisterFields, value: string) => {
    setFields(current => ({...current, [key]: value}));
  };

  const captureLocation = async () => {
    if (!preciseLocationConsent) {
      setError('Choose to share your precise farm pin before using GPS.');
      return;
    }
    setLocationBusy(true);
    setError('');
    try {
      setCoordinates(await captureFarmCoordinates());
    } catch (locationError) {
      setError(locationError instanceof Error ? locationError.message : 'Could not read the farm location.');
    } finally {
      setLocationBusy(false);
    }
  };

  const submit = async () => {
    const currentEmail = isRegistering ? fields.email : email;
    const currentPassword = isRegistering ? fields.password : password;
    if (!currentEmail.trim() || !currentPassword) {
      setError('Enter your email and password to continue.');
      return;
    }
    if (isRegistering && (!fields.name.trim() || !fields.propertyName.trim() || !fields.municipality.trim() || !consent)) {
      setError('Add your name, farm, municipality and reporting consent.');
      return;
    }
    if (isRegistering && currentPassword.length < 10) {
      setError('Choose a password with at least 10 characters.');
      return;
    }
    setBusy(true);
    setError('');
    onMessage('');
    try {
      await onServerConfigured(serverAddress);
      const response = isRegistering
        ? await apiRequest<AuthResponse>('/auth/register', undefined, {
          method: 'POST',
          body: JSON.stringify({
            name: fields.name,
            email: fields.email.trim().toLowerCase(),
            password: fields.password,
            propertyName: fields.propertyName,
            province: fields.province,
            municipality: fields.municipality,
            barangay: fields.barangay || null,
            sizeHectares: fields.sizeHectares ? Number(fields.sizeHectares) : null,
            latitude: coordinates?.latitude ?? null,
            longitude: coordinates?.longitude ?? null,
            locationConsent: preciseLocationConsent,
          }),
        })
        : await apiRequest<AuthResponse>('/auth/login', undefined, {
          method: 'POST',
          body: JSON.stringify({accountType: 'farmer', email: email.trim().toLowerCase(), password}),
        });
      await onAuthenticated(response);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not sign in right now.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.authRoot}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.authBrandRow}>
            <BrandMark large />
            <View style={styles.flex}>
              <Text style={styles.brandName}>RSSI</Text>
              <Text style={styles.brandSub}>Sugarcane field tracker</Text>
            </View>
            <Pill text="SRA" tone="blue" />
          </View>
          <View style={styles.authCard}>
            <View style={styles.eyebrow}><Text style={styles.eyebrowText}>FARMER ACCOUNT</Text></View>
            <Text style={styles.authTitle}>{isRegistering ? 'Create your account' : 'Welcome back'}</Text>
            <Text style={styles.authSub}>
              {isRegistering
                ? 'Register your own farm so your observations reach the SRA review team.'
                : 'Sign in to view your farms and report sugarcane observations.'}
            </Text>
            {error ? <Notice text={error} tone="error" /> : null}
            {isRegistering ? (
              <>
                <Field label="Full name" value={fields.name} onChangeText={value => setField('name', value)} placeholder="Your name" autoCapitalize="words" />
                <Field label="Farm or property name" value={fields.propertyName} onChangeText={value => setField('propertyName', value)} placeholder="e.g. Family sugarcane farm" autoCapitalize="words" />
                <View style={styles.fieldRow}>
                  <View style={styles.fieldGrow}>
                    <Text style={styles.inputLabel}>Province</Text>
                    <View style={styles.choiceRow}>
                      {['Negros Oriental', 'Negros Occidental'].map(province => (
                        <Choice key={province} label={province === 'Negros Oriental' ? 'Oriental' : 'Occidental'} active={fields.province === province} onPress={() => setField('province', province)} compact />
                      ))}
                    </View>
                  </View>
                </View>
                <Field label="Municipality / city" value={fields.municipality} onChangeText={value => setField('municipality', value)} placeholder="Your municipality" autoCapitalize="words" />
                <View style={styles.fieldRow}>
                  <View style={styles.fieldGrow}><Field label="Barangay (optional)" value={fields.barangay} onChangeText={value => setField('barangay', value)} placeholder="Barangay" autoCapitalize="words" /></View>
                  <View style={styles.fieldNarrow}><Field label="Farm size (ha)" value={fields.sizeHectares} onChangeText={value => setField('sizeHectares', value.replace(/[^0-9.]/g, ''))} placeholder="Optional" keyboardType="decimal-pad" /></View>
                </View>
                <ToggleLine
                  title="Save an exact GPS pin for my farm (optional)"
                  description="Only you and authorized SRA staff can view it. The pin is not shared with community posts."
                  value={preciseLocationConsent}
                  onValueChange={value => {setPreciseLocationConsent(value); if (!value) {setCoordinates(null);}}}
                />
                <Button label={locationBusy ? 'Getting location…' : coordinates ? 'GPS pin saved for this form' : 'Use current location for farm'} kind="light" onPress={() => void captureLocation()} disabled={!preciseLocationConsent || locationBusy} loading={locationBusy} />
                {coordinates ? <Text style={styles.coordinatesText}>GPS: {coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}</Text> : null}
                <Field label="Email address" value={fields.email} onChangeText={value => setField('email', value)} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
                <Field label="Password (10 characters minimum)" value={fields.password} onChangeText={value => setField('password', value)} placeholder="Create a password" secureTextEntry />
                <ToggleLine
                  title="I agree to send my farm observations to SRA for review."
                  description="Your precise property location stays private to authorized staff."
                  value={consent}
                  onValueChange={setConsent}
                />
              </>
            ) : (
              <>
                <Field label="Email address" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
                <Field label="Password" value={password} onChangeText={setPassword} placeholder="Your password" secureTextEntry />
              </>
            )}
            <Field label="RSSI server address" value={serverAddress} onChangeText={setServerAddress} placeholder="https://your-rssi-server.example" keyboardType="url" autoCapitalize="none" />
            <Text style={styles.helperText}>Use the SRA network address on Wi-Fi or your organization’s HTTPS address. This setting is saved on this device.</Text>
            <Button label={busy ? 'Connecting…' : isRegistering ? 'Create farmer account' : 'Sign in'} onPress={submit} disabled={busy} loading={busy} />
            <TouchableOpacity style={styles.linkButton} onPress={() => {setMode(isRegistering ? 'login' : 'register'); setError('');}}>
              <Text style={styles.linkText}>{isRegistering ? 'Already registered? Sign in' : 'New to RSSI? Register your farm'}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.authFooter}>
            <Text style={styles.authFooterText}>SRA • Negros Oriental & Negros Occidental</Text>
            <Text style={styles.authFooterSub}>Use the official RSSI server account provided by your team.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FarmerShell(props: {
  user: Farmer;
  properties: FarmProperty[];
  reports: FieldReport[];
  queue: QueuedReport[];
  community: CommunityUpdate[];
  tab: Tab;
  setTab: (tab: Tab) => void;
  hasInternet: boolean;
  networkConnected: boolean;
  serverReachable: boolean;
  busy: boolean;
  notice: string;
  clearNotice: () => void;
  token: string;
  onReportQueued: (item: QueuedReport) => Promise<void>;
  onSync: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onLoadCommunity: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onChangeServer: () => Promise<void>;
  onCommunityConfirmed: (id: number) => Promise<void>;
}) {
  const {
    user, properties, reports, queue, community, tab, setTab,
    hasInternet, networkConnected, serverReachable, busy, notice, clearNotice, token,
  } = props;
  const [farmForm, setFarmForm] = useState(false);
  const [farmBusy, setFarmBusy] = useState(false);
  const [farmMessage, setFarmMessage] = useState('');
  const [farmValues, setFarmValues] = useState({name: '', province: 'Negros Oriental', municipality: '', barangay: '', size: ''});
  const [farmLocationConsent, setFarmLocationConsent] = useState(false);
  const [farmCoordinates, setFarmCoordinates] = useState<FarmCoordinates | null>(null);
  const [farmLocationBusy, setFarmLocationBusy] = useState(false);
  const [selectedFarm, setSelectedFarm] = useState<number | null>(properties[0]?.id ?? null);
  const [observedAt, setObservedAt] = useState(localDate());
  const [observations, setObservations] = useState('');
  const [damage, setDamage] = useState('');
  const [severity, setSeverity] = useState('Not assessed');
  const [area, setArea] = useState('');
  const [locationDescription, setLocationDescription] = useState('');
  const [reportConsent, setReportConsent] = useState(false);
  const [communityShare, setCommunityShare] = useState(false);
  const [photos, setPhotos] = useState<QueuedPhoto[]>([]);
  const [reportError, setReportError] = useState('');
  const [reportBusy, setReportBusy] = useState(false);

  useEffect(() => {
    if (selectedFarm === null && properties.length > 0) {
      setSelectedFarm(properties[0].id);
    } else if (selectedFarm !== null && !properties.some(property => property.id === selectedFarm)) {
      setSelectedFarm(properties[0]?.id ?? null);
    }
  }, [properties, selectedFarm]);

  const selectedProperty = properties.find(property => property.id === selectedFarm) || properties[0];
  const totalReports = reports.length;
  const localTotal = totalReports + queue.filter(item => !item.serverReportId).length;
  const dashboardStatus = networkConnected ? (serverReachable ? 'Connected' : 'Server checking') : 'Offline mode';

  const saveFarm = async () => {
    if (!farmValues.name.trim() || !farmValues.municipality.trim()) {
      setFarmMessage('Enter a farm name and municipality.');
      return;
    }
    setFarmBusy(true);
    setFarmMessage('');
    try {
      const response = await apiRequest<{data: FarmProperty}>('/farmers/me/properties', token, {
        method: 'POST',
        body: JSON.stringify({
          name: farmValues.name,
          province: farmValues.province,
          municipality: farmValues.municipality,
          barangay: farmValues.barangay || null,
          sizeHectares: farmValues.size ? Number(farmValues.size) : null,
          latitude: farmCoordinates?.latitude ?? null,
          longitude: farmCoordinates?.longitude ?? null,
          locationConsent: farmLocationConsent,
        }),
      });
      setFarmValues({name: '', province: farmValues.province, municipality: '', barangay: '', size: ''});
      setFarmForm(false);
      setFarmMessage('Farm added to your account.');
      setFarmLocationConsent(false);
      setFarmCoordinates(null);
      await props.onRefresh();
      setSelectedFarm(response.data.id);
    } catch (error) {
      setFarmMessage(error instanceof Error ? error.message : 'Could not save the farm.');
    } finally {
      setFarmBusy(false);
    }
  };

  const addPhoto = async (source: 'camera' | 'library') => {
    const response = source === 'camera'
      ? await launchCamera({mediaType: 'photo', quality: 0.8, maxWidth: 1800, maxHeight: 1800, saveToPhotos: false})
      : await launchImageLibrary({mediaType: 'photo', selectionLimit: Math.max(1, 5 - photos.length), quality: 0.8, maxWidth: 1800, maxHeight: 1800});
    if (response.didCancel || response.errorCode || !response.assets?.length) {
      if (response.errorMessage) {
        setReportError(response.errorMessage);
      }
      return;
    }
    try {
      const available = response.assets.slice(0, 5 - photos.length);
      const copied: QueuedPhoto[] = [];
      for (const asset of available) {
        if (!asset.uri) { continue; }
        copied.push(await storePhoto(user.id, asset.uri, asset.fileName || `${createId()}.jpg`, asset.type || 'image/jpeg'));
      }
      setPhotos(current => [...current, ...copied]);
      setReportError('');
    } catch {
      setReportError('Could not save that photo safely on this device. Try another image.');
    }
  };

  const submitReport = async () => {
    if (!selectedProperty) {
      setReportError('Add a farm before submitting an observation.');
      return;
    }
    if (!observations.trim() || !damage.trim()) {
      setReportError('Describe what you observed and the damage.');
      return;
    }
    if (!observedAt.match(/^\d{4}-\d{2}-\d{2}$/)) {
      setReportError('Enter the observed date in YYYY-MM-DD format.');
      return;
    }
    if (!reportConsent) {
      setReportError('Consent is required before you send this report to SRA.');
      return;
    }
    setReportBusy(true);
    setReportError('');
    const item: QueuedReport = {
      clientSubmissionId: createId(),
      body: {
        propertyId: selectedProperty.id,
        observedAt,
        observations: observations.trim(),
        damageDescription: damage.trim(),
        farmerSeverity: severity,
        affectedArea: area ? Number(area) : 0,
        consent: true,
        communitySharing: communityShare,
        locationDescription: locationDescription.trim() || null,
      },
      propertyName: selectedProperty.name,
      propertyProvince: selectedProperty.province,
      propertyMunicipality: selectedProperty.municipality,
      photos,
      createdAt: new Date().toISOString(),
    };
    try {
      await props.onReportQueued(item);
      setObservations('');
      setDamage('');
      setArea('');
      setLocationDescription('');
      setSeverity('Not assessed');
      setReportConsent(false);
      setCommunityShare(false);
      setPhotos([]);
      setObservedAt(localDate());
    } catch (error) {
      setReportError(error instanceof Error ? error.message : 'Could not save this report on your device.');
    } finally {
      setReportBusy(false);
    }
  };

  const createFarmForm = () => (
    <Card>
      <Text style={styles.cardTitle}>{farmForm ? 'Add a farm' : 'Your farms'}</Text>
      <Text style={styles.cardSub}>{farmForm ? 'Add a farm you own or manage. Exact coordinates are not required.' : 'Only farms in your account are shown here.'}</Text>
      {farmMessage ? <Notice text={farmMessage} tone={farmMessage.includes('added') ? 'success' : 'error'} /> : null}
      {farmForm ? (
        <>
          <Field label="Farm name" value={farmValues.name} onChangeText={value => setFarmValues(current => ({...current, name: value}))} placeholder="Your farm name" autoCapitalize="words" />
          <Text style={styles.inputLabel}>Province</Text>
          <View style={styles.choiceRow}>
            {['Negros Oriental', 'Negros Occidental'].map(province => (
              <Choice key={province} label={province === 'Negros Oriental' ? 'Oriental' : 'Occidental'} active={farmValues.province === province} onPress={() => setFarmValues(current => ({...current, province}))} compact />
            ))}
          </View>
          <Field label="Municipality / city" value={farmValues.municipality} onChangeText={value => setFarmValues(current => ({...current, municipality: value}))} placeholder="Municipality / city" autoCapitalize="words" />
          <Field label="Barangay (optional)" value={farmValues.barangay} onChangeText={value => setFarmValues(current => ({...current, barangay: value}))} placeholder="Barangay" autoCapitalize="words" />
          <Field label="Farm size in hectares (optional)" value={farmValues.size} onChangeText={value => setFarmValues(current => ({...current, size: value.replace(/[^0-9.]/g, '')}))} placeholder="0.00" keyboardType="decimal-pad" />
          <ToggleLine
            title="Save an exact GPS pin for my farm (optional)"
            description="Your exact pin is visible only to you and authorized SRA staff."
            value={farmLocationConsent}
            onValueChange={value => {setFarmLocationConsent(value); if (!value) {setFarmCoordinates(null);}}}
          />
          <Button label={farmLocationBusy ? 'Getting location…' : farmCoordinates ? 'GPS pin saved for this farm' : 'Use current location'} kind="light" disabled={!farmLocationConsent || farmLocationBusy} loading={farmLocationBusy} onPress={() => {
            setFarmLocationBusy(true);
            void captureFarmCoordinates().then(setFarmCoordinates).catch(error => setFarmMessage(error instanceof Error ? error.message : 'Could not read location.')).finally(() => setFarmLocationBusy(false));
          }} />
          {farmCoordinates ? <Text style={styles.coordinatesText}>GPS: {farmCoordinates.latitude.toFixed(5)}, {farmCoordinates.longitude.toFixed(5)}</Text> : null}
          {!networkConnected ? <Text style={styles.helperText}>Adding a farm needs a connection. You can still save reports about farms already on your account.</Text> : null}
          <View style={styles.buttonRow}>
            <Button label="Cancel" kind="light" onPress={() => {setFarmForm(false); setFarmLocationConsent(false); setFarmCoordinates(null);}} />
            <Button label="Save farm" onPress={saveFarm} disabled={!networkConnected || farmBusy} loading={farmBusy} />
          </View>
        </>
      ) : (
        <>
          {properties.length === 0 ? <EmptyState icon="⌖" title="No farms added yet" description="Add your farm to start reporting field observations." /> : null}
          {properties.map(property => <FarmRow key={property.id} property={property} onPress={() => setSelectedFarm(property.id)} selected={selectedFarm === property.id} />)}
          <Button label="＋  Add a farm" kind="light" onPress={() => {setFarmForm(true); setFarmMessage(''); setFarmLocationConsent(false); setFarmCoordinates(null);}} />
        </>
      )}
    </Card>
  );

  const mapHtml = useMemo(() => createMapHtml(properties), [properties]);

  const renderCurrentScreen = () => {
    switch (tab) {
      case 'home':
        return (
          <>
            <View style={styles.welcomeBlock}>
              <Text style={styles.welcomeEyebrow}>SRA • FARMER WORKSPACE</Text>
              <Text style={styles.welcomeTitle}>Hello, {user.name.split(' ')[0]} 👋</Text>
              <Text style={styles.welcomeSub}>Your sugarcane observations, in one place.</Text>
            </View>
            <View style={styles.summaryGrid}>
              <SummaryCard label="My farms" value={String(properties.length)} icon="⌖" tone="green" />
              <SummaryCard label="My reports" value={String(localTotal)} icon="▤" tone="blue" />
              <SummaryCard label="Waiting to sync" value={String(queue.length)} icon="↻" tone="amber" />
            </View>
            <Card style={styles.statusCard}>
              <View style={styles.statusHead}>
                <View style={[styles.statusDot, {backgroundColor: networkConnected && serverReachable ? C.green : C.amber}]} />
                <Text style={styles.statusTitle}>{dashboardStatus}</Text>
                {busy ? <ActivityIndicator size="small" color={C.blue} /> : null}
              </View>
              <Text style={styles.cardSub}>
                {networkConnected && serverReachable
                  ? 'Your farm and report details are up to date.'
                  : networkConnected
                    ? 'Your network is available. Checking your RSSI server…'
                    : 'Saved farm details and your report drafts stay available offline.'}
              </Text>
              {queue.length > 0 ? <Button label={busy ? 'Syncing reports…' : `Sync ${queue.length} waiting report${queue.length === 1 ? '' : 's'}`} onPress={props.onSync} disabled={!networkConnected || busy} loading={busy} kind="light" /> : null}
            </Card>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Quick actions</Text>
              <Text style={styles.sectionHint}>Your farm data only</Text>
            </View>
            <View style={styles.quickGrid}>
              <QuickAction icon="＋" label="New report" color={C.blue} onPress={() => setTab('report')} />
              <QuickAction icon="⌖" label="View my farms" color={C.green} onPress={() => setTab('farms')} />
              <QuickAction icon="◎" label="Community updates" color="#8B5BC5" onPress={() => setTab('community')} />
            </View>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Recent reports</Text>
              <TouchableOpacity onPress={() => setTab('history')}><Text style={styles.linkText}>See all</Text></TouchableOpacity>
            </View>
            <Card>
              {reports.length === 0 && queue.length === 0 ? (
                <EmptyState icon="▤" title="No reports yet" description="When you submit a field observation, it will appear here." />
              ) : (
                <>
                  {queue.slice(0, 2).map(item => <QueuedReportRow key={item.clientSubmissionId} item={item} />)}
                  {reports.slice(0, 3).map(report => <ReportRow key={report.id} report={report} />)}
                </>
              )}
            </Card>
            <PrivacyNote text="A farmer report is an observation for SRA review. It is not a confirmed RSSI finding." />
          </>
        );
      case 'farms':
        return (
          <>
            <PageIntro eyebrow="YOUR PROPERTY RECORDS" title="My farms" subtitle="Manage the farm locations linked to your account." />
            {createFarmForm()}
            <Card>
              <Text style={styles.cardTitle}>Location privacy</Text>
              <Text style={styles.bodyText}>Farm addresses are visible to you and authorized SRA staff. Your exact GPS pin is optional and is only stored when you give consent.</Text>
            </Card>
          </>
        );
      case 'map':
        return (
          <>
            <PageIntro eyebrow="NEGROS ORIENTAL & OCCIDENTAL" title="Farm map" subtitle="A real OpenStreetMap view centered on the Negros region. Only your consented farm pins appear." />
            <Card style={styles.mapCard}>
              {hasInternet ? (
                <WebView
                  key={mapHtml}
                  originWhitelist={['*']}
                  source={{html: mapHtml}}
                  style={styles.mapWebView}
                  javaScriptEnabled
                  domStorageEnabled
                  userAgent="RSSI-Pest-Tracker/1.0 (SRA farmer app)"
                  mixedContentMode="never"
                  setSupportMultipleWindows={false}
                />
              ) : (
                <View style={styles.mapOffline}>
                  <Text style={styles.mapOfflineIcon}>⌖</Text>
                  <Text style={styles.cardTitle}>Map needs internet</Text>
                  <Text style={styles.cardSub}>Your saved farms remain available below. Map tiles load only while connected.</Text>
                </View>
              )}
            </Card>
            {properties.length === 0 ? (
              <Card><EmptyState icon="⌖" title="No farm records" description="Add a farm to see it in your account." /></Card>
            ) : properties.map(property => <FarmRow key={property.id} property={property} onPress={() => setTab('farms')} selected={false} />)}
            <Text style={styles.mapAttribution}>Map data © OpenStreetMap contributors</Text>
            <PrivacyNote text="Other farmers’ exact locations are not shown. Reports are observations pending SRA review." />
          </>
        );
      case 'report':
        return (
          <>
            <PageIntro eyebrow="FARMER OBSERVATION" title="New field report" subtitle="Describe what you saw. SRA reviews and assesses the report independently." />
            {properties.length === 0 ? (
              <Card>
                <EmptyState icon="⌖" title="Add your farm first" description="A report must be linked to a farm in your account." />
                <Button label="Go to My farms" onPress={() => setTab('farms')} />
              </Card>
            ) : (
              <>
                <Card>
                  <Text style={styles.cardTitle}>Farm & observation</Text>
                  <Text style={styles.cardSub}>Reports are saved to your account and kept private for SRA review.</Text>
                  <Text style={styles.inputLabel}>Farm *</Text>
                  {properties.map(property => (
                    <TouchableOpacity key={property.id} style={[styles.propertyOption, selectedFarm === property.id && styles.propertyOptionActive]} onPress={() => setSelectedFarm(property.id)}>
                      <View style={[styles.radio, selectedFarm === property.id && styles.radioActive]}>{selectedFarm === property.id ? <View style={styles.radioInner} /> : null}</View>
                      <View style={styles.flex}>
                        <Text style={styles.propertyOptionTitle}>{property.name}</Text>
                        <Text style={styles.propertyOptionSub}>{property.municipality} · {property.province}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  <Field label="Observed date (YYYY-MM-DD) *" value={observedAt} onChangeText={setObservedAt} placeholder="2026-10-08" />
                  <Field label="Location description (optional)" value={locationDescription} onChangeText={setLocationDescription} placeholder="Field section or nearby landmark" />
                  <Field label="What did you observe? *" value={observations} onChangeText={setObservations} placeholder="Describe the leaves, stalks, or affected area…" multiline />
                  <Field label="Damage description *" value={damage} onChangeText={setDamage} placeholder="What damage did you notice?" multiline />
                  <Text style={styles.inputLabel}>Your severity estimate</Text>
                  <Text style={styles.helperText}>This is your observation; SRA records its assessment separately.</Text>
                  <View style={styles.choiceRow}>
                    {['Low', 'Moderate', 'Severe', 'Not assessed'].map(value => <Choice key={value} label={value} active={severity === value} onPress={() => setSeverity(value)} compact />)}
                  </View>
                  <Field label="Estimated affected area (ha)" value={area} onChangeText={value => setArea(value.replace(/[^0-9.]/g, ''))} placeholder="If you know it" keyboardType="decimal-pad" />
                </Card>
                <Card>
                  <View style={styles.cardTitleRow}><Text style={styles.cardTitle}>Photo evidence</Text><Pill text={`${photos.length} / 5`} tone="blue" /></View>
                  <Text style={styles.cardSub}>Photos are optional and are uploaded privately with your report.</Text>
                  <View style={styles.photoActions}>
                    <Button label="Take photo" kind="light" onPress={() => void addPhoto('camera')} disabled={photos.length >= 5} />
                    <Button label="Choose photos" kind="light" onPress={() => void addPhoto('library')} disabled={photos.length >= 5} />
                  </View>
                  {photos.map(photo => (
                    <View key={photo.id} style={styles.photoRow}>
                      <Text style={styles.photoName} numberOfLines={1}>{photo.name}</Text>
                      <TouchableOpacity onPress={() => setPhotos(current => current.filter(item => item.id !== photo.id))}><Text style={styles.removeText}>Remove</Text></TouchableOpacity>
                    </View>
                  ))}
                </Card>
                <Card>
                  <Text style={styles.cardTitle}>Consent & sharing</Text>
                  <ToggleLine
                    title="I give SRA permission to review these observations and photos. *"
                    description="Required to send a report. You can submit while offline; it will wait securely on this device."
                    value={reportConsent}
                    onValueChange={setReportConsent}
                  />
                  <ToggleLine
                    title="Share an anonymized observation with the farmer community"
                    description="Optional. Your name, farm name, barangay, exact location and photos are never shared."
                    value={communityShare}
                    onValueChange={setCommunityShare}
                  />
                  <PrivacyNote text="Community confirmations show agreement with an observation. They do not confirm RSSI or replace an SRA review." />
                  {reportError ? <Notice text={reportError} tone="error" /> : null}
                  <Button label={reportBusy ? 'Saving report…' : 'Save & submit report'} onPress={() => void submitReport()} loading={reportBusy} disabled={reportBusy} />
                  <Text style={styles.formFooter}>If offline, your report appears in My reports as waiting to sync.</Text>
                </Card>
              </>
            )}
          </>
        );
      case 'history':
        return (
          <>
            <PageIntro eyebrow="YOUR SUBMISSIONS" title="My reports" subtitle="Review your submitted observations and sync status." action={<TouchableOpacity onPress={() => void props.onRefresh()} disabled={!networkConnected}><Text style={[styles.linkText, !networkConnected && styles.disabledText]}>Refresh</Text></TouchableOpacity>} />
            {queue.length > 0 ? (
              <Card>
                <View style={styles.cardTitleRow}><Text style={styles.cardTitle}>Waiting to sync</Text><Pill text={String(queue.length)} tone="amber" /></View>
                <Text style={styles.cardSub}>Reports are stored on this device and send automatically when the server is reachable.</Text>
                {queue.map(item => <QueuedReportRow key={item.clientSubmissionId} item={item} />)}
                <Button label={busy ? 'Syncing…' : 'Try sync now'} onPress={props.onSync} disabled={!networkConnected || busy} loading={busy} kind="light" />
              </Card>
            ) : null}
            <Card>
              <View style={styles.cardTitleRow}><Text style={styles.cardTitle}>Submitted reports</Text><Pill text={String(reports.length)} tone="blue" /></View>
              {!networkConnected ? <Notice text="Showing your last saved records. New report updates load when you reconnect." tone="info" /> : null}
              {reports.length === 0 ? (
                <EmptyState icon="▤" title="No submitted reports" description="Reports you submit will appear here after they sync." />
              ) : reports.map(report => <ReportRow key={report.id} report={report} />)}
            </Card>
            <PrivacyNote text="Report status and severity are separate. A farmer’s estimate is not an SRA diagnosis." />
          </>
        );
      case 'community':
        return (
          <>
            <PageIntro eyebrow="FARMER COMMUNITY" title="Community updates" subtitle="Opt-in, anonymized observations shared by farmers in the Negros provinces." />
            {!networkConnected ? (
              <Card><EmptyState icon="⌁" title="Updates need internet" description="Community posts and confirmations are online-only. Your own farms and saved reports still work offline." /></Card>
            ) : (
              <Card>
                <View style={styles.cardTitleRow}><Text style={styles.cardTitle}>Shared observations</Text><TouchableOpacity onPress={() => void props.onLoadCommunity()}><Text style={styles.linkText}>Reload</Text></TouchableOpacity></View>
                <Text style={styles.cardSub}>Only posts that farmers chose to share appear here. Identity and exact farm details are removed.</Text>
                {community.length === 0 ? (
                  <EmptyState icon="◎" title="No shared updates yet" description="When a farmer opts in to share an observation, it will appear here." />
                ) : community.map(item => (
                  <CommunityCard key={item.id} item={item} onConfirm={() => void props.onCommunityConfirmed(item.id)} disabled={!networkConnected || item.confirmed_by_me} />
                ))}
              </Card>
            )}
            <PrivacyNote text="A community response is not a pest confirmation. Only authorized SRA staff can verify a report." />
          </>
        );
      case 'profile':
        return (
          <>
            <PageIntro eyebrow="ACCOUNT & PRIVACY" title="My account" subtitle="Your farmer profile and local sync settings." />
            <Card>
              <View style={styles.profileHeader}><Avatar name={user.name} /><View style={styles.flex}><Text style={styles.profileName}>{user.name}</Text><Text style={styles.cardSub}>{user.email}</Text></View></View>
              <InfoRow label="Farmer reference" value={user.reference} />
              <InfoRow label="Account status" value={user.status} />
              <InfoRow label="API server" value={getApiBaseUrl()} compact />
              <Text style={styles.helperText}>For production phones, configure this app to use your organization’s HTTPS RSSI server.</Text>
            </Card>
            <Card>
              <Text style={styles.cardTitle}>Data stored for offline use</Text>
              <Text style={styles.bodyText}>Your account session, saved farm details, last report list and unsent reports are stored in your device’s protected credential store. Unsent items sync when RSSI is reachable.</Text>
              <Text style={[styles.bodyText, {marginTop: 12}]}>Community updates are not cached and cannot be opened offline.</Text>
            </Card>
            {notice ? <Notice text={notice} tone="info" /> : null}
            <Button label="Change server address" kind="light" onPress={() => props.onChangeServer().catch(() => undefined)} />
            <Button label="Sign out" kind="danger" onPress={() => void props.onSignOut()} />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.appRoot} edges={['top', 'left', 'right']}>
      <View style={styles.appHeader}>
        <View style={styles.headerBrand}><BrandMark /><View><Text style={styles.headerBrandName}>RSSI</Text><Text style={styles.headerBrandSub}>Farmer app</Text></View></View>
        <TouchableOpacity style={styles.headerAccount} onPress={() => setTab('profile')}>
          <View style={[styles.headerOnlineDot, {backgroundColor: networkConnected && serverReachable ? C.green : C.amber}]} />
          <Text style={styles.headerAccountText} numberOfLines={1}>{user.name.split(' ')[0]}</Text>
          <Text style={styles.headerAvatar}>{user.name.trim().charAt(0).toUpperCase()}</Text>
        </TouchableOpacity>
      </View>
      {!networkConnected ? (
        <View style={styles.offlineBanner}><Text style={styles.offlineIcon}>⌁</Text><Text style={styles.offlineBannerText}>Offline mode · saved reports will sync automatically</Text></View>
      ) : networkConnected && !serverReachable ? (
        <View style={[styles.offlineBanner, styles.serverBanner]}><Text style={styles.offlineIcon}>↻</Text><Text style={styles.offlineBannerText}>Network available · reconnecting to RSSI server</Text></View>
      ) : null}
      {notice ? (
        <TouchableOpacity style={styles.noticeWrap} onPress={clearNotice}><Notice text={notice} tone="info" /><Text style={styles.dismissText}>Tap to dismiss</Text></TouchableOpacity>
      ) : null}
      <ScrollView style={styles.flex} contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled">
        {renderCurrentScreen()}
        <View style={styles.bottomSpacer} />
      </ScrollView>
      <View style={styles.bottomNav}>
        <NavButton icon="⌂" label="Home" active={tab === 'home'} onPress={() => setTab('home')} />
        <NavButton icon="⌖" label="Farms" active={tab === 'farms'} onPress={() => setTab('farms')} />
        <TouchableOpacity style={styles.primaryNavAction} onPress={() => setTab('report')} accessibilityRole="button" accessibilityLabel="New report">
          <Text style={styles.primaryNavPlus}>＋</Text><Text style={styles.primaryNavLabel}>Report</Text>
        </TouchableOpacity>
        <NavButton icon="▤" label="Reports" active={tab === 'history'} onPress={() => setTab('history')} badge={queue.length} />
        <NavButton icon="◎" label="Updates" active={tab === 'community'} onPress={() => setTab('community')} />
      </View>
    </SafeAreaView>
  );
}

function LoadingScreen() {
  return <SafeAreaView style={styles.loadingRoot}><BrandMark large /><ActivityIndicator color={C.blue} size="large" style={{marginTop: 18}} /><Text style={styles.loadingText}>Opening your RSSI workspace…</Text></SafeAreaView>;
}

function BrandMark({large = false}: {large?: boolean}) {
  return <Image source={require('./assets/rssi-logo.png')} resizeMode="contain" style={[styles.brandMark, large && styles.brandMarkLarge]} accessibilityLabel="RSSI logo" />;
}

function PageIntro({eyebrow, title, subtitle, action}: {eyebrow: string; title: string; subtitle: string; action?: React.ReactNode}) {
  return <View style={styles.pageIntro}>
    <View style={styles.pageIntroRow}><View style={styles.flex}><Text style={styles.pageEyebrow}>{eyebrow}</Text><Text style={styles.pageTitle}>{title}</Text></View>{action}</View>
    <Text style={styles.pageSub}>{subtitle}</Text>
  </View>;
}

function Card({children, style}: {children: React.ReactNode; style?: object}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'decimal-pad' | 'numeric' | 'url';
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return <View style={styles.fieldWrap}>
    <Text style={styles.inputLabel}>{props.label}</Text>
    <TextInput
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      placeholderTextColor="#98A5B8"
      secureTextEntry={props.secureTextEntry}
      keyboardType={props.keyboardType || 'default'}
      multiline={props.multiline}
      autoCapitalize={props.autoCapitalize || 'sentences'}
      autoCorrect={!props.secureTextEntry && props.keyboardType !== 'email-address'}
      style={[styles.input, props.multiline && styles.multilineInput]}
      textAlignVertical={props.multiline ? 'top' : 'center'}
    />
  </View>;
}

function Button({label, onPress, disabled = false, loading = false, kind = 'primary'}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  kind?: 'primary' | 'light' | 'danger';
}) {
  return <TouchableOpacity
    style={[styles.button, kind === 'light' && styles.buttonLight, kind === 'danger' && styles.buttonDanger, disabled && styles.buttonDisabled]}
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
  >
    {loading ? <ActivityIndicator size="small" color={kind === 'primary' ? C.paper : C.blue} style={styles.buttonSpinner} /> : null}
    <Text style={[styles.buttonText, kind === 'light' && styles.buttonLightText, kind === 'danger' && styles.buttonDangerText]}>{label}</Text>
  </TouchableOpacity>;
}

function Choice({label, active, onPress, compact = false}: {label: string; active: boolean; onPress: () => void; compact?: boolean}) {
  return <TouchableOpacity onPress={onPress} style={[styles.choice, active && styles.choiceActive, compact && styles.choiceCompact]}>
    <View style={[styles.radio, active && styles.radioActive]}>{active ? <View style={styles.radioInner} /> : null}</View>
    <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
  </TouchableOpacity>;
}

function ToggleLine({title, description, value, onValueChange}: {title: string; description: string; value: boolean; onValueChange: (value: boolean) => void}) {
  return <View style={styles.toggleLine}>
    <View style={styles.flex}><Text style={styles.toggleTitle}>{title}</Text><Text style={styles.helperText}>{description}</Text></View>
    <Switch value={value} onValueChange={onValueChange} trackColor={{false: '#CAD3E0', true: '#98D0AC'}} thumbColor={value ? C.green : '#FFFFFF'} />
  </View>;
}

function Pill({text, tone}: {text: string; tone: 'blue' | 'green' | 'amber' | 'red' | 'gray'}) {
  const toneStyle = tone === 'green' ? styles.pillGreen : tone === 'amber' ? styles.pillAmber : tone === 'red' ? styles.pillRed : tone === 'gray' ? styles.pillGray : styles.pillBlue;
  return <View style={[styles.pill, toneStyle]}><Text style={[styles.pillText, toneStyle]}>{text}</Text></View>;
}

function Notice({text, tone}: {text: string; tone: 'info' | 'error' | 'success'}) {
  const toneStyle = tone === 'error' ? styles.noticeError : tone === 'success' ? styles.noticeSuccess : styles.noticeInfo;
  const symbol = tone === 'error' ? '!' : tone === 'success' ? '✓' : 'i';
  return <View style={[styles.notice, toneStyle]}><Text style={[styles.noticeSymbol, toneStyle]}>{symbol}</Text><Text style={[styles.noticeText, toneStyle]}>{text}</Text></View>;
}

function PrivacyNote({text}: {text: string}) {
  return <View style={styles.privacyNote}><Text style={styles.privacyIcon}>i</Text><Text style={styles.privacyText}>{text}</Text></View>;
}

function EmptyState({icon, title, description}: {icon: string; title: string; description: string}) {
  return <View style={styles.emptyState}><View style={styles.emptyIcon}><Text style={styles.emptyIconText}>{icon}</Text></View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyDescription}>{description}</Text></View>;
}

function SummaryCard({label, value, icon, tone}: {label: string; value: string; icon: string; tone: 'green' | 'blue' | 'amber'}) {
  const color = tone === 'green' ? C.green : tone === 'amber' ? C.amber : C.blue;
  const background = tone === 'green' ? C.greenSoft : tone === 'amber' ? C.amberSoft : C.paleBlue;
  return <View style={styles.summaryCard}><View style={[styles.summaryIcon, {backgroundColor: background}]}><Text style={[styles.summaryIconText, {color}]}>{icon}</Text></View><Text style={styles.summaryValue}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text></View>;
}

function QuickAction({icon, label, color, onPress}: {icon: string; label: string; color: string; onPress: () => void}) {
  return <TouchableOpacity style={styles.quickAction} onPress={onPress}><View style={[styles.quickIcon, {backgroundColor: `${color}14`}]}><Text style={[styles.quickIconText, {color}]}>{icon}</Text></View><Text style={styles.quickLabel}>{label}</Text><Text style={styles.quickArrow}>›</Text></TouchableOpacity>;
}

function FarmRow({property, onPress, selected}: {property: FarmProperty; onPress: () => void; selected: boolean}) {
  return <TouchableOpacity style={[styles.farmRow, selected && styles.farmRowSelected]} onPress={onPress}>
    <View style={styles.farmPin}><Text style={styles.farmPinText}>⌖</Text></View>
    <View style={styles.flex}><Text style={styles.farmName}>{property.name}</Text><Text style={styles.farmAddress}>{[property.barangay, property.municipality, property.province].filter(Boolean).join(' · ')}</Text></View>
    <View style={styles.farmMeta}><Text style={styles.farmArea}>{property.size_hectares ? `${property.size_hectares} ha` : 'Size not set'}</Text><Text style={styles.farmPinStatus}>{property.latitude !== null && property.longitude !== null ? 'Pin saved' : 'Area only'}</Text></View>
  </TouchableOpacity>;
}

function ReportRow({report}: {report: FieldReport}) {
  const tone = report.verification_status === 'Confirmed' ? 'green' : report.verification_status === 'No detection' ? 'gray' : 'amber';
  return <View style={styles.reportRow}>
    <View style={styles.reportRowIcon}><Text style={styles.reportRowIconText}>▤</Text></View>
    <View style={styles.flex}><Text style={styles.reportRowName}>{report.property_name}</Text><Text style={styles.reportRowMeta}>{report.code} · {report.observed_at}</Text><Text style={styles.reportRowSub}>{report.municipality}, {report.province}</Text></View>
    <Pill text={report.verification_status} tone={tone} />
  </View>;
}

function QueuedReportRow({item}: {item: QueuedReport}) {
  return <View style={styles.reportRow}>
    <View style={[styles.reportRowIcon, {backgroundColor: C.amberSoft}]}><Text style={[styles.reportRowIconText, {color: C.amber}]}>↻</Text></View>
    <View style={styles.flex}><Text style={styles.reportRowName}>{item.propertyName}</Text><Text style={styles.reportRowMeta}>{item.propertyMunicipality}, {item.propertyProvince}</Text><Text style={styles.reportRowSub}>{item.photos.length > 0 ? `Waiting to upload ${item.photos.length} photo${item.photos.length === 1 ? '' : 's'}` : 'Waiting for server connection'}</Text>{item.lastError ? <Text style={styles.queueError}>{item.lastError}</Text> : null}</View>
    <Pill text="Pending" tone="amber" />
  </View>;
}

function CommunityCard({item, onConfirm, disabled}: {item: CommunityUpdate; onConfirm: () => void; disabled: boolean}) {
  return <View style={styles.communityCard}>
    <View style={styles.communityHeader}><Pill text={item.farmer_severity} tone={item.farmer_severity === 'Severe' ? 'red' : item.farmer_severity === 'Moderate' ? 'amber' : 'green'} /><Text style={styles.communityDate}>{item.observed_at} · {item.municipality}, {item.province}</Text></View>
    <Text style={styles.communityTitle}>{item.observations}</Text>
    <Text style={styles.bodyText}>{item.damage_description}</Text>
    <View style={styles.communityFoot}><Text style={styles.communityStatus}>SRA status: {item.verification_status}</Text><Text style={styles.communityStatus}>{item.confirmation_count} agreed</Text></View>
    <Button label={item.confirmed_by_me ? 'You agreed with this observation' : 'I observed something similar'} onPress={onConfirm} disabled={disabled} kind={item.confirmed_by_me ? 'light' : 'light'} />
    <Text style={styles.helperText}>Agreement is not an official verification.</Text>
  </View>;
}

function InfoRow({label, value, compact = false}: {label: string; value: string; compact?: boolean}) {
  return <View style={[styles.infoRow, compact && styles.infoRowCompact]}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>;
}

function Avatar({name}: {name: string}) {
  return <View style={styles.avatar}><Text style={styles.avatarText}>{name.trim().charAt(0).toUpperCase()}</Text></View>;
}

function NavButton({icon, label, active, onPress, badge = 0}: {icon: string; label: string; active: boolean; onPress: () => void; badge?: number}) {
  return <TouchableOpacity style={styles.navButton} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
    <View style={[styles.navIconWrap, active && styles.navIconWrapActive]}><Text style={[styles.navIconText, active && styles.navIconTextActive]}>{icon}</Text>{badge > 0 ? <View style={styles.navBadge}><Text style={styles.navBadgeText}>{badge > 9 ? '9+' : badge}</Text></View> : null}</View>
    <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
  </TouchableOpacity>;
}

function createMapHtml(properties: FarmProperty[]): string {
  const markers = properties.filter(property => property.latitude !== null && property.longitude !== null && property.location_consent).map(property => [property.latitude, property.longitude]);
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>html,body,#map{height:100%;margin:0;background:#eaf0ea}.leaflet-control-attribution{font-size:9px!important}</style></head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>const map=L.map('map').setView([9.58,122.95],8);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);const farms=${JSON.stringify(markers)};farms.forEach(([lat,lng])=>L.circleMarker([lat,lng],{radius:8,color:'#ffffff',weight:3,fillColor:'#16834a',fillOpacity:1}).addTo(map).bindPopup('Your farm'));if(farms.length){map.fitBounds(L.latLngBounds(farms).pad(0.35),{maxZoom:11})}</script></body></html>`;
}

function localDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  appRoot: {flex: 1, backgroundColor: C.background},
  authRoot: {flex: 1, backgroundColor: C.background},
  authScroll: {flexGrow: 1, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32},
  authBrandRow: {flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 2, marginBottom: 22},
  brandName: {color: C.ink, fontSize: 20, fontWeight: '800', letterSpacing: 0.2},
  brandSub: {color: C.muted, fontSize: 12, marginTop: 1},
  brandMark: {width: 40, height: 40, borderRadius: 14, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#C8E7D1'},
  brandMarkLarge: {width: 54, height: 54, borderRadius: 18},
  brandMarkText: {fontSize: 23, fontWeight: '900', color: C.green, marginTop: -2},
  brandLeaf: {position: 'absolute', width: 8, height: 5, backgroundColor: '#7BC34B', borderRadius: 8, transform: [{rotate: '-28deg'}], right: 8, top: 9},
  authCard: {backgroundColor: C.paper, borderColor: C.line, borderWidth: 1, borderRadius: 22, padding: 22, shadowColor: '#17233B', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: {width: 0, height: 7}, elevation: 3},
  eyebrow: {alignSelf: 'flex-start', backgroundColor: C.paleBlue, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 5, marginBottom: 10},
  eyebrowText: {color: C.blue, fontSize: 10, fontWeight: '800', letterSpacing: 0.8},
  authTitle: {fontSize: 26, lineHeight: 33, fontWeight: '800', color: C.ink},
  authSub: {color: C.muted, fontSize: 14, lineHeight: 21, marginTop: 7, marginBottom: 16},
  authFooter: {alignItems: 'center', paddingTop: 22, gap: 6},
  authFooterText: {fontSize: 12, color: C.muted, fontWeight: '700'},
  authFooterSub: {fontSize: 11, color: '#8A97AB', textAlign: 'center'},
  appHeader: {height: 61, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, backgroundColor: C.paper, borderBottomColor: C.line, borderBottomWidth: 1},
  headerBrand: {flexDirection: 'row', alignItems: 'center', gap: 9},
  headerBrandName: {fontSize: 15, fontWeight: '800', color: C.ink},
  headerBrandSub: {fontSize: 10, color: C.muted, marginTop: 1},
  headerAccount: {flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 145},
  headerOnlineDot: {width: 7, height: 7, borderRadius: 4},
  headerAccountText: {fontSize: 12, fontWeight: '600', color: C.muted, maxWidth: 76},
  headerAvatar: {overflow: 'hidden', textAlign: 'center', textAlignVertical: 'center', width: 31, height: 31, backgroundColor: C.paleBlue, borderRadius: 16, fontSize: 13, fontWeight: '800', color: C.blue},
  offlineBanner: {minHeight: 34, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.amberSoft, paddingHorizontal: 12, paddingVertical: 6},
  serverBanner: {backgroundColor: C.paleBlue},
  offlineIcon: {color: C.amber, fontSize: 16, fontWeight: '800'},
  offlineBannerText: {fontSize: 11, color: C.amber, fontWeight: '700'},
  noticeWrap: {paddingHorizontal: 16, paddingTop: 7},
  dismissText: {textAlign: 'right', color: C.muted, fontSize: 10, marginTop: -4, marginBottom: 3},
  screenContent: {paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12},
  bottomSpacer: {height: 6},
  pageIntro: {marginBottom: 15},
  pageIntroRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  pageEyebrow: {fontSize: 10, letterSpacing: 0.9, color: C.green, fontWeight: '800', marginBottom: 4},
  pageTitle: {fontSize: 26, lineHeight: 32, fontWeight: '800', color: C.ink},
  pageSub: {color: C.muted, fontSize: 13, lineHeight: 19, marginTop: 5},
  welcomeBlock: {paddingTop: 2, paddingBottom: 16},
  welcomeEyebrow: {fontSize: 10, color: C.green, fontWeight: '800', letterSpacing: 1},
  welcomeTitle: {fontSize: 25, lineHeight: 32, color: C.ink, fontWeight: '800', marginTop: 5},
  welcomeSub: {fontSize: 13, color: C.muted, marginTop: 4},
  summaryGrid: {flexDirection: 'row', gap: 9, marginBottom: 12},
  summaryCard: {flex: 1, minHeight: 114, padding: 12, borderRadius: 15, backgroundColor: C.paper, borderColor: C.line, borderWidth: 1},
  summaryIcon: {width: 29, height: 29, borderRadius: 9, justifyContent: 'center', alignItems: 'center'},
  summaryIconText: {fontSize: 17, fontWeight: '800'},
  summaryValue: {fontSize: 23, fontWeight: '800', color: C.ink, marginTop: 8},
  summaryLabel: {fontSize: 10, color: C.muted, marginTop: 1},
  card: {backgroundColor: C.paper, borderRadius: 17, borderColor: C.line, borderWidth: 1, padding: 16, marginBottom: 12},
  statusCard: {padding: 15},
  statusHead: {flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5},
  statusDot: {width: 8, height: 8, borderRadius: 4},
  statusTitle: {fontSize: 14, fontWeight: '800', color: C.ink, flex: 1},
  cardTitle: {fontSize: 16, color: C.ink, fontWeight: '800'},
  cardTitleRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8},
  cardSub: {fontSize: 12, color: C.muted, lineHeight: 18, marginTop: 4, marginBottom: 10},
  bodyText: {fontSize: 13, color: '#46546B', lineHeight: 20, marginTop: 7},
  sectionHeading: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, marginBottom: 9},
  sectionTitle: {fontSize: 16, fontWeight: '800', color: C.ink},
  sectionHint: {fontSize: 11, color: C.muted},
  quickGrid: {gap: 8, marginBottom: 12},
  quickAction: {minHeight: 57, borderRadius: 14, backgroundColor: C.paper, borderColor: C.line, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 11},
  quickIcon: {width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center'},
  quickIconText: {fontSize: 19, fontWeight: '800'},
  quickLabel: {fontSize: 13, color: C.ink, fontWeight: '700', flex: 1},
  quickArrow: {fontSize: 22, color: '#98A5B8'},
  button: {minHeight: 47, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingHorizontal: 15, backgroundColor: C.blue, marginTop: 10},
  buttonLight: {backgroundColor: C.paper, borderColor: '#C9D5E5', borderWidth: 1},
  buttonDanger: {backgroundColor: C.redSoft, borderColor: '#F0CED0', borderWidth: 1},
  buttonDisabled: {opacity: 0.48},
  buttonText: {color: C.paper, fontSize: 14, fontWeight: '800', textAlign: 'center'},
  buttonLightText: {color: C.blue},
  buttonDangerText: {color: C.red},
  buttonSpinner: {marginRight: 8},
  buttonRow: {flexDirection: 'row', gap: 8},
  linkButton: {alignItems: 'center', paddingTop: 16, paddingBottom: 2},
  linkText: {color: C.blue, fontWeight: '800', fontSize: 12},
  disabledText: {opacity: 0.45},
  fieldWrap: {marginTop: 11, flex: 1},
  fieldRow: {flexDirection: 'row', gap: 10},
  fieldGrow: {flex: 1},
  fieldNarrow: {width: 122},
  inputLabel: {fontSize: 12, fontWeight: '700', color: C.ink, marginBottom: 6},
  input: {minHeight: 46, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#D5DFEC', borderRadius: 10, backgroundColor: '#FBFCFE', color: C.ink, fontSize: 14},
  multilineInput: {minHeight: 104, lineHeight: 20},
  choiceRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 3, marginBottom: 3},
  choice: {minHeight: 42, paddingHorizontal: 10, borderWidth: 1, borderColor: '#D7E0EC', borderRadius: 10, alignItems: 'center', flexDirection: 'row', gap: 7, backgroundColor: C.paper, flexGrow: 1},
  choiceCompact: {minHeight: 38, paddingHorizontal: 9, flexGrow: 0},
  choiceActive: {borderColor: C.blue, backgroundColor: C.paleBlue},
  choiceText: {fontSize: 11, color: C.muted, fontWeight: '600'},
  choiceTextActive: {color: C.blue, fontWeight: '800'},
  radio: {width: 15, height: 15, borderRadius: 8, borderWidth: 1.5, borderColor: '#AAB6C8', alignItems: 'center', justifyContent: 'center'},
  radioActive: {borderColor: C.blue},
  radioInner: {width: 7, height: 7, borderRadius: 4, backgroundColor: C.blue},
  helperText: {fontSize: 11, color: '#8290A5', lineHeight: 16, marginTop: 5},
  toggleLine: {flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 12, borderBottomColor: '#EDF0F5', borderBottomWidth: 1},
  toggleTitle: {fontSize: 12, fontWeight: '700', color: C.ink, lineHeight: 17},
  notice: {borderWidth: 1, borderRadius: 11, paddingVertical: 10, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginVertical: 7},
  noticeInfo: {backgroundColor: C.paleBlue, borderColor: '#C8D8FF', color: C.blue},
  noticeError: {backgroundColor: C.redSoft, borderColor: '#EBC6C8', color: C.red},
  noticeSuccess: {backgroundColor: C.greenSoft, borderColor: '#C8E7D1', color: C.green},
  noticeSymbol: {fontSize: 13, fontWeight: '900'},
  noticeText: {fontSize: 11, lineHeight: 16, flex: 1},
  privacyNote: {flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, borderRadius: 12, backgroundColor: '#EEF3FE', marginVertical: 5},
  privacyIcon: {textAlign: 'center', width: 17, height: 17, borderRadius: 9, color: C.blue, backgroundColor: '#DBE7FF', fontSize: 11, fontWeight: '900', overflow: 'hidden'},
  privacyText: {fontSize: 11, lineHeight: 16, color: '#52678A', flex: 1},
  emptyState: {alignItems: 'center', paddingVertical: 17, paddingHorizontal: 9},
  emptyIcon: {width: 42, height: 42, borderRadius: 14, backgroundColor: C.paleBlue, alignItems: 'center', justifyContent: 'center', marginBottom: 9},
  emptyIconText: {color: C.blue, fontSize: 22, fontWeight: '700'},
  emptyTitle: {fontSize: 14, fontWeight: '800', color: C.ink, textAlign: 'center'},
  emptyDescription: {fontSize: 12, color: C.muted, lineHeight: 18, textAlign: 'center', marginTop: 5, maxWidth: 300},
  farmRow: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomColor: '#EDF0F5', borderBottomWidth: 1},
  farmRowSelected: {backgroundColor: '#F8FAFF', marginHorizontal: -7, paddingHorizontal: 7, borderRadius: 10},
  farmPin: {width: 34, height: 34, borderRadius: 11, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center'},
  farmPinText: {fontSize: 17, color: C.green, fontWeight: '800'},
  farmName: {fontSize: 13, fontWeight: '800', color: C.ink},
  farmAddress: {fontSize: 10, color: C.muted, lineHeight: 15, marginTop: 3},
  farmMeta: {alignItems: 'flex-end'},
  farmArea: {fontSize: 10, fontWeight: '700', color: C.ink},
  farmPinStatus: {fontSize: 9, color: C.muted, marginTop: 4},
  propertyOption: {flexDirection: 'row', alignItems: 'center', gap: 9, padding: 11, borderWidth: 1, borderColor: C.line, borderRadius: 11, marginTop: 7},
  propertyOptionActive: {borderColor: C.blue, backgroundColor: C.paleBlue},
  propertyOptionTitle: {fontSize: 12, fontWeight: '800', color: C.ink},
  propertyOptionSub: {fontSize: 10, color: C.muted, marginTop: 3},
  photoActions: {flexDirection: 'row', gap: 8},
  photoRow: {flexDirection: 'row', alignItems: 'center', gap: 9, borderTopColor: '#EDF0F5', borderTopWidth: 1, marginTop: 9, paddingTop: 9},
  photoName: {flex: 1, color: C.ink, fontSize: 11},
  removeText: {color: C.red, fontSize: 11, fontWeight: '700'},
  formFooter: {textAlign: 'center', fontSize: 10, color: C.muted, marginTop: 8},
  mapCard: {padding: 0, overflow: 'hidden'},
  mapWebView: {height: 360, backgroundColor: '#eaf0ea'},
  mapOffline: {height: 240, alignItems: 'center', justifyContent: 'center', padding: 25, backgroundColor: '#EAF0EA'},
  mapOfflineIcon: {fontSize: 35, color: C.green, marginBottom: 8},
  mapAttribution: {textAlign: 'right', fontSize: 10, color: C.muted, marginTop: -5, marginBottom: 7},
  coordinatesText: {fontSize: 10, color: C.muted, marginTop: 6},
  reportRow: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomColor: '#EDF0F5', borderBottomWidth: 1},
  reportRowIcon: {width: 34, height: 34, borderRadius: 11, backgroundColor: C.paleBlue, alignItems: 'center', justifyContent: 'center'},
  reportRowIconText: {fontSize: 16, color: C.blue, fontWeight: '800'},
  reportRowName: {fontSize: 12, fontWeight: '800', color: C.ink},
  reportRowMeta: {fontSize: 10, color: C.muted, marginTop: 3},
  reportRowSub: {fontSize: 10, color: '#8692A5', marginTop: 2},
  queueError: {fontSize: 10, color: C.red, marginTop: 3},
  pill: {alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: C.paleBlue},
  pillBlue: {backgroundColor: C.paleBlue, color: C.blue},
  pillGreen: {backgroundColor: C.greenSoft, color: C.green},
  pillAmber: {backgroundColor: C.amberSoft, color: C.amber},
  pillRed: {backgroundColor: C.redSoft, color: C.red},
  pillGray: {backgroundColor: '#EEF1F5', color: C.muted},
  pillText: {fontSize: 9, fontWeight: '800'},
  communityCard: {borderTopColor: '#EDF0F5', borderTopWidth: 1, paddingTop: 13, marginTop: 12},
  communityHeader: {flexDirection: 'row', alignItems: 'center', gap: 8},
  communityDate: {fontSize: 10, color: C.muted, flex: 1},
  communityTitle: {fontSize: 14, color: C.ink, fontWeight: '800', lineHeight: 20, marginTop: 11},
  communityFoot: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginBottom: 3},
  communityStatus: {fontSize: 10, color: C.muted},
  profileHeader: {flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 13},
  profileName: {fontSize: 16, fontWeight: '800', color: C.ink},
  avatar: {width: 48, height: 48, borderRadius: 17, backgroundColor: C.greenSoft, justifyContent: 'center', alignItems: 'center'},
  avatarText: {fontSize: 20, fontWeight: '900', color: C.green},
  infoRow: {flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 12, borderTopColor: '#EDF0F5', borderTopWidth: 1},
  infoRowCompact: {alignItems: 'flex-start'},
  infoLabel: {fontSize: 11, color: C.muted},
  infoValue: {fontSize: 11, color: C.ink, fontWeight: '700', textAlign: 'right', flexShrink: 1},
  bottomNav: {height: 70, paddingHorizontal: 5, paddingBottom: Platform.OS === 'ios' ? 4 : 2, backgroundColor: C.paper, borderTopColor: C.line, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around'},
  navButton: {flex: 1, height: 60, alignItems: 'center', justifyContent: 'center', gap: 2},
  navIconWrap: {minWidth: 38, height: 29, borderRadius: 10, alignItems: 'center', justifyContent: 'center'},
  navIconWrapActive: {backgroundColor: C.paleBlue},
  navIconText: {fontSize: 20, color: '#8290A5', fontWeight: '700'},
  navIconTextActive: {color: C.blue},
  navLabel: {fontSize: 9, color: '#7B889C', fontWeight: '600'},
  navLabelActive: {color: C.blue, fontWeight: '800'},
  navBadge: {position: 'absolute', top: -3, right: -3, minWidth: 14, height: 14, borderRadius: 7, backgroundColor: C.amber, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3},
  navBadgeText: {fontSize: 8, color: C.paper, fontWeight: '900'},
  primaryNavAction: {width: 61, height: 58, alignItems: 'center', justifyContent: 'center', marginTop: -12},
  primaryNavPlus: {backgroundColor: C.blue, color: C.paper, width: 36, height: 36, textAlign: 'center', textAlignVertical: 'center', fontSize: 23, fontWeight: '600', borderRadius: 13, overflow: 'hidden'},
  primaryNavLabel: {fontSize: 9, color: C.blue, fontWeight: '800', marginTop: 2},
  loadingRoot: {flex: 1, backgroundColor: C.background, justifyContent: 'center', alignItems: 'center'},
  loadingText: {fontSize: 13, color: C.muted, marginTop: 11},
});

export default App;
