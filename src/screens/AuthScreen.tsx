import React, {useRef, useState} from 'react';
import {KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {ApiError, apiRequest, AuthResponse, geocodeFarmAddress} from '../api';
import {captureFarmCoordinates, FarmCoordinates} from '../location';
import {LocationPicker} from '../components/LocationPicker';
import {DropdownField} from '../components/DropdownField';
import negrosLocations from '../data/negrosLocations.json';
import {styles} from '../theme';
import {RegisterFields} from '../types';
import {BrandMark, Button, Choice, Field, LanguageSwitcher, LoadingScreen, Notice, Pill, ToggleLine} from '../components/UI';
import {LocalizedText as Text} from '../i18n';
import {useTheme} from '../theme';

export default function AuthScreen({
  onAuthenticated,
  onMessage,
  initialMessage,
}: {
  onAuthenticated: (auth: AuthResponse) => Promise<void>;
  onMessage: (message: string) => void;
  initialMessage: string;
}) {
  useTheme();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fields, setFields] = useState<RegisterFields>({
    name: '', email: '', password: '', propertyName: '', province: 'Negros Oriental',
    municipality: '', barangay: '', address: '', sizeHectares: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialMessage);
  const [consent, setConsent] = useState(false);
  const [preciseLocationConsent, setPreciseLocationConsent] = useState(false);
  const [coordinates, setCoordinates] = useState<FarmCoordinates | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const [addressLookupBusy, setAddressLookupBusy] = useState(false);
  const [addressLookupMessage, setAddressLookupMessage] = useState('');
  const geocodedAddressKey = useRef('');
  const addressLookupRevision = useRef(0);
  const locationRequestRevision = useRef(0);
  const isRegistering = mode === 'register';

  const setField = (key: keyof RegisterFields, value: string) => {
    setFields(current => ({...current, [key]: value}));
  };

  const captureLocation = async () => {
    const revision = ++locationRequestRevision.current;
    setLocationBusy(true);
    setLocationMessage('');
    try {
      const currentLocation = await captureFarmCoordinates();
      if (revision === locationRequestRevision.current) setCoordinates(currentLocation);
    } catch (locationError) {
      if (revision === locationRequestRevision.current) {
        setLocationMessage(locationError instanceof Error ? locationError.message : 'Could not read the farm location.');
      }
    } finally {
      if (revision === locationRequestRevision.current) setLocationBusy(false);
    }
  };

  const moveMapPin = (value: FarmCoordinates) => {
    locationRequestRevision.current += 1;
    setLocationBusy(false);
    setCoordinates(value);
    if (addressLookupMessage.startsWith('Suggested map match:')) {
      setAddressLookupMessage('Pin moved. Check that it marks your exact farm location.');
    }
  };

  const locateEnteredAddress = async () => {
    const address = fields.address.trim();
    if (!address || !fields.municipality || !fields.barangay) return;
    const lookupKey = [address, fields.province, fields.municipality, fields.barangay].join('|').toLocaleLowerCase();
    if (geocodedAddressKey.current === lookupKey) return;

    const revision = ++addressLookupRevision.current;
    setAddressLookupBusy(true);
    setAddressLookupMessage('Looking up this farm address…');
    try {
      const result = await geocodeFarmAddress({
        address,
        province: fields.province,
        municipality: fields.municipality,
        barangay: fields.barangay,
        country: 'Philippines',
      });
      if (revision !== addressLookupRevision.current) return;
      if (!Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) {
        throw new Error('Could not find this address. Move the pin on the map instead.');
      }
      geocodedAddressKey.current = lookupKey;
      setCoordinates({latitude: result.latitude, longitude: result.longitude});
      setAddressLookupMessage(result.formattedAddress
        ? `Suggested map match: ${result.formattedAddress}. Check the pin and move it if needed.`
        : 'Address found. Check the pin and move it to your exact farm location.');
    } catch (lookupError) {
      if (revision !== addressLookupRevision.current) return;
      const message = lookupError instanceof ApiError && (lookupError.status === 404 || lookupError.status === 501)
        ? 'Address lookup is not available on the RSSI server yet. Move the pin on the map instead.'
        : lookupError instanceof ApiError && lookupError.status === 422
          ? 'Could not find this address. Move the pin on the map instead.'
          : 'Address lookup could not be completed. Move the pin on the map instead.';
      setAddressLookupMessage(message);
    } finally {
      if (revision === addressLookupRevision.current) setAddressLookupBusy(false);
    }
  };

  const changeAddress = (address: string) => {
    addressLookupRevision.current += 1;
    locationRequestRevision.current += 1;
    geocodedAddressKey.current = '';
    setField('address', address);
    setCoordinates(null);
    setAddressLookupBusy(false);
    setLocationBusy(false);
    setAddressLookupMessage('');
  };

  const municipalityOptions = negrosLocations[fields.province as keyof typeof negrosLocations] || [];
  const selectedMunicipality = municipalityOptions.find(item => item.name === fields.municipality);
  const barangayOptions = selectedMunicipality?.barangays || [];

  const selectProvince = (province: string) => {
    addressLookupRevision.current += 1;
    locationRequestRevision.current += 1;
    geocodedAddressKey.current = '';
    setFields(current => ({...current, province, municipality: '', barangay: ''}));
    setCoordinates(null);
    setLocationMessage('');
    setAddressLookupMessage('');
    setAddressLookupBusy(false);
    setLocationBusy(false);
  };

  const selectMunicipality = (municipality: string) => {
    addressLookupRevision.current += 1;
    locationRequestRevision.current += 1;
    geocodedAddressKey.current = '';
    setFields(current => ({...current, municipality, barangay: ''}));
    setCoordinates(null);
    setLocationMessage('');
    setAddressLookupMessage('');
    setAddressLookupBusy(false);
    setLocationBusy(false);
  };

  const selectBarangay = (barangay: string) => {
    addressLookupRevision.current += 1;
    geocodedAddressKey.current = '';
    setAddressLookupBusy(false);
    setAddressLookupMessage('');
    setField('barangay', barangay);
    setCoordinates(null);
    setLocationMessage('');
    void captureLocation();
  };

  const submit = async () => {
    const currentEmail = isRegistering ? fields.email : email;
    const currentPassword = isRegistering ? fields.password : password;
    if (!currentEmail.trim() || !currentPassword) {
      setError('Enter your email and password to continue.');
      return;
    }
    const farmArea = Number(fields.sizeHectares);
    if (isRegistering && (!fields.name.trim() || !fields.propertyName.trim() || !fields.municipality.trim() || !fields.barangay.trim() || !fields.address.trim() || !fields.sizeHectares.trim() || !Number.isFinite(farmArea) || farmArea <= 0 || !consent)) {
      setError('Add your name, farm, municipality, barangay, complete farm address, farm area greater than zero and reporting consent.');
      return;
    }
    if (isRegistering && currentPassword.length < 10) {
      setError('Choose a password with at least 10 characters.');
      return;
    }
    if (isRegistering && preciseLocationConsent && !coordinates) {
      setError('Choose a point on the map or use current location before saving consent.');
      return;
    }
    setBusy(true);
    setError('');
    onMessage('');
    try {
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
            address: fields.address.trim() || null,
            sizeHectares: fields.sizeHectares ? Number(fields.sizeHectares) : null,
            latitude: preciseLocationConsent ? coordinates?.latitude ?? null : null,
            longitude: preciseLocationConsent ? coordinates?.longitude ?? null : null,
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
          <View style={styles.authCard}><LanguageSwitcher /></View>
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
                        <Choice key={province} label={province === 'Negros Oriental' ? 'Oriental' : 'Occidental'} active={fields.province === province} onPress={() => selectProvince(province)} compact />
                      ))}
                    </View>
                  </View>
                </View>
                <DropdownField
                  label="Municipality / city *"
                  value={fields.municipality}
                  options={municipalityOptions.map(item => item.name)}
                  placeholder="Select your municipality or city"
                  onSelect={selectMunicipality}
                />
                <View style={styles.fieldRow}>
                  <View style={styles.fieldGrow}><DropdownField label="Barangay *" value={fields.barangay} options={barangayOptions} placeholder={fields.municipality ? 'Select your barangay' : 'Select a municipality first'} disabled={!fields.municipality} onSelect={selectBarangay} /></View>
                  <View style={styles.fieldNarrow}><Field label="Farm area (ha) *" value={fields.sizeHectares} onChangeText={value => setField('sizeHectares', value.replace(/[^0-9.]/g, ''))} placeholder="0.00" keyboardType="decimal-pad" /></View>
                </View>
                <Field label="Complete farm address *" value={fields.address} onChangeText={changeAddress} onBlur={() => void locateEnteredAddress()} placeholder="House / lot, sitio or purok, barangay, municipality, province" multiline autoCapitalize="words" />
                <Text style={styles.helperText}>After you finish the address and leave this field, RSSI sends it to Geoapify through the RSSI server to suggest a map pin. Review the suggestion and move the pin to your exact farm location.</Text>
                {addressLookupMessage ? <Text style={styles.helperText}>{addressLookupMessage}</Text> : null}
                <Text style={[styles.inputLabel, {marginTop: 14}]}>Choose your exact farm location</Text>
                <Notice text="After you choose a barangay, RSSI will place a pin at your current location. Use two fingers to move the map under the fixed center pin; touching the map will not drag the pin." tone="info" />
                <LocationPicker value={coordinates} onChange={moveMapPin} />
                {locationBusy ? <Text style={styles.helperText}>Getting your current location…</Text> : null}
                {locationMessage ? <Text style={styles.helperText}>{locationMessage}</Text> : null}
                {coordinates ? <View style={{marginTop: 4}}>
                  <Text style={styles.coordinatesText}>Selected farm pin</Text>
                  <Text style={styles.coordinatesText}>{coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}</Text>
                  {coordinates.accuracy !== undefined ? <Text style={styles.helperText}>Device GPS accuracy: ±{Math.round(coordinates.accuracy)} m</Text> : null}
                </View> : null}
                <Text style={styles.helperText}>Map tiles require an internet connection.</Text>
                <ToggleLine
                  title="Show this farm in SRA Map Monitoring"
                  description="Turn this on and save a pin to show this farm to authorized SRA staff. Leave it off to keep the exact location private."
                  value={preciseLocationConsent}
                  onValueChange={setPreciseLocationConsent}
                />
                {preciseLocationConsent && !coordinates ? <Text style={styles.helperText}>Choose a point on the map or use current location before saving consent.</Text> : null}
                {fields.barangay ? <Button label={locationBusy ? 'Getting location…' : 'Use my current location'} kind="light" onPress={() => void captureLocation()} disabled={locationBusy} loading={locationBusy} /> : null}
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
            <Button label={busy ? 'Connecting…' : isRegistering ? 'Register' : 'Sign in'} onPress={submit} disabled={busy || addressLookupBusy} loading={busy || addressLookupBusy} />
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

