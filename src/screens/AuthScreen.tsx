import React, {useState} from 'react';
import {KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {WebView} from 'react-native-webview';
import {apiRequest, AuthResponse} from '../api';
import {captureFarmCoordinates, FarmCoordinates} from '../location';
import {styles} from '../theme';
import {RegisterFields} from '../types';
import {BrandMark, Button, Choice, Field, LoadingScreen, Notice, Pill, ToggleLine} from '../components/UI';

export default function AuthScreen({
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
              <Text style={styles.brandSub}>Sugar Regulatory Administration</Text>
            </View>
            <Pill text="SRA" tone="blue" />
          </View>
          <View style={styles.authCard}>
            <View style={styles.eyebrow}><Text style={styles.eyebrowText}>FARMER ACCOUNT</Text></View>
            <Text style={styles.authTitle}>{isRegistering ? 'Create Farmer Account' : 'Welcome back'}</Text>
            <Text style={styles.authSub}>
              {isRegistering
                ? 'Register your own farm so your observations reach the SRA review team.'
                : 'Sign in to view your farms and report sugarcane observations.'}
            </Text>
            {error ? <Notice text={error} tone="error" /> : null}
            {isRegistering ? (
              <>
                <Field label="Farmer name *" value={fields.name} onChangeText={value => setField('name', value)} placeholder="Enter your full name" autoCapitalize="words" />
                <Field label="Farm / plot location *" value={fields.propertyName} onChangeText={value => setField('propertyName', value)} placeholder="Farm name or landmark" autoCapitalize="words" />
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
                <Field label="Municipality / city *" value={fields.municipality} onChangeText={value => setField('municipality', value)} placeholder="Select your municipality or city" autoCapitalize="words" />
                <View style={styles.fieldRow}>
                  <View style={styles.fieldGrow}><Field label="Barangay (optional)" value={fields.barangay} onChangeText={value => setField('barangay', value)} placeholder="Select barangay" autoCapitalize="words" /></View>
                  <View style={styles.fieldNarrow}><Field label="Farm area (ha)" value={fields.sizeHectares} onChangeText={value => setField('sizeHectares', value.replace(/[^0-9.]/g, ''))} placeholder="Optional" keyboardType="decimal-pad" /></View>
                </View>
                <Text style={styles.inputLabel}>Pinned location</Text>
                <Text style={styles.helperText}>Save a pin only if you want authorized SRA staff to see your farm’s precise location.</Text>
                <ToggleLine
                  title="Save an exact GPS pin for my farm (optional)"
                  description="Only you and authorized SRA staff can view it. The pin is not shared with community posts."
                  value={preciseLocationConsent}
                  onValueChange={value => {setPreciseLocationConsent(value); if (!value) {setCoordinates(null);}}}
                />
                <Button label={locationBusy ? 'Getting location…' : coordinates ? 'Location pin confirmed' : 'Get GPS location'} kind="light" onPress={() => void captureLocation()} disabled={!preciseLocationConsent || locationBusy} loading={locationBusy} />
                {coordinates ? <>
                  <WebView
                    source={{html: createFarmPinPreviewHtml(coordinates.latitude, coordinates.longitude)}}
                    style={styles.authMapPreview}
                    javaScriptEnabled
                    domStorageEnabled
                    mixedContentMode="never"
                    setSupportMultipleWindows={false}
                    accessibilityLabel="Farm pin preview map"
                  />
                  <Text style={styles.coordinatesText}>Pinned location · {coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}</Text>
                </> : null}
                <Field label="Email address" value={fields.email} onChangeText={value => setField('email', value)} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
                <Field label="Password (10 characters minimum)" value={fields.password} onChangeText={value => setField('password', value)} placeholder="Create a password" secureTextEntry />
                <ToggleLine
                  title="I agree to share my farm reports with SRA for review."
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
            <Button label={busy ? 'Connecting…' : isRegistering ? 'Register' : 'Sign in'} onPress={submit} disabled={busy} loading={busy} />
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

export {LoadingScreen};

function createFarmPinPreviewHtml(latitude: number, longitude: number): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>html,body,#map{height:100%;margin:0;background:#e5f2f7}.leaflet-control-attribution{font-size:8px!important}</style></head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>const map=L.map('map',{zoomControl:false}).setView([${latitude},${longitude}],15);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);L.marker([${latitude},${longitude}]).addTo(map).bindPopup('Your farm location').openPopup();</script></body></html>`;
}
