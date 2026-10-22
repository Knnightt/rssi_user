import React, {useEffect, useRef, useState} from 'react';
import {KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, View} from 'react-native';
import {Asset} from 'react-native-image-picker';
import {SafeAreaView} from 'react-native-safe-area-context';
import {ApiError, apiRequest, AuthResponse, geocodeFarmAddress, uploadProfilePhoto} from '../api';
import {captureFarmCoordinates, FarmCoordinates} from '../location';
import {LocationPicker} from '../components/LocationPicker';
import {DropdownField} from '../components/DropdownField';
import negrosLocations from '../data/negrosLocations.json';
import {styles} from '../theme';
import {RegisterFields} from '../types';
import {BrandMark, Button, Choice, Field, LanguageSwitcher, LoadingScreen, Notice, Pill, ProfilePhotoPicker, ToggleLine} from '../components/UI';
import {LocalizedText as Text} from '../i18n';
import {useTheme} from '../theme';
import {readSecure, removeSecure, writeSecure} from '../secureStorage';

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
  const [loginUsername, setLoginUsername] = useState('');
  const [password, setPassword] = useState('');
  const [registerStep, setRegisterStep] = useState(0);
  const [addFarm, setAddFarm] = useState(false);
  const [fields, setFields] = useState<RegisterFields>({
    name: '', username: '', email: '', phoneNumber: '', password: '', propertyName: '', province: 'Negros Oriental',
    municipality: '', barangay: '', address: '', sizeHectares: '',
  });
  const [profilePhoto, setProfilePhoto] = useState<Asset | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialMessage);
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

  useEffect(() => {
    let mounted = true;
    void readSecure('last-farmer-username').then(value => {
      if (mounted && value) setLoginUsername(value);
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, []);

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

  const continueRegistration = () => {
    setError('');
    if (registerStep === 0) {
      if (!fields.name.trim()) {
        setError('Enter your full name.');
        return;
      }
      setRegisterStep(1);
      return;
    }
    if (registerStep === 1) {
      const normalizedUsername = fields.username.trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,32}$/.test(normalizedUsername)) {
        setError('Choose a username with 3–32 letters, numbers, dots, underscores or hyphens.');
        return;
      }
      if (fields.password.length < 10) {
        setError('Choose a password with at least 10 characters.');
        return;
      }
      setField('username', normalizedUsername);
      setRegisterStep(2);
      return;
    }
    if (registerStep === 2) {
      if (addFarm) {
        const farmArea = Number(fields.sizeHectares);
        if (!fields.propertyName.trim() || !fields.municipality.trim() || !fields.barangay.trim() || !fields.address.trim() || !fields.sizeHectares.trim() || !Number.isFinite(farmArea) || farmArea <= 0) {
          setError('Complete the farm name, municipality, barangay, address and area, or choose to add the farm later.');
          return;
        }
        if (preciseLocationConsent && !coordinates) {
          setError('Choose a point on the map or use current location before saving consent.');
          return;
        }
      }
      setRegisterStep(3);
    }
  };

  const finishRegistration = async () => {
    const email = fields.email.trim().toLowerCase();
    const phone = fields.phoneNumber.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email address.');
      return;
    }
    if (!phone) {
      setError('Enter your phone number.');
      return;
    }
    setBusy(true);
    setError('');
    onMessage('');
    try {
      const body: Record<string, unknown> = {
        name: fields.name.trim(),
        username: fields.username.trim().toLowerCase(),
        phoneNumber: phone,
        password: fields.password,
        email,
      };
      if (addFarm) {
        Object.assign(body, {
          propertyName: fields.propertyName.trim(),
          province: fields.province,
          municipality: fields.municipality,
          barangay: fields.barangay,
          address: fields.address.trim(),
          sizeHectares: Number(fields.sizeHectares),
          latitude: preciseLocationConsent ? coordinates?.latitude ?? null : null,
          longitude: preciseLocationConsent ? coordinates?.longitude ?? null : null,
          locationConsent: preciseLocationConsent,
        });
      }
      const response = await apiRequest<AuthResponse>('/auth/register', undefined, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      let photoUploadFailed = false;
      if (profilePhoto) {
        try {
          const uploaded = await uploadProfilePhoto(response.access_token, profilePhoto);
          response.user.profile_photo_url = uploaded.profile_photo_url;
        } catch {
          photoUploadFailed = true;
        }
      }
      await writeSecure('last-farmer-username', fields.username.trim().toLowerCase()).catch(() => undefined);
      await onAuthenticated(response);
      if (photoUploadFailed) onMessage('Your account was created, but the profile picture was not uploaded. You can add it later in My profile.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not create the account right now.');
    } finally {
      setBusy(false);
    }
  };

  const signIn = async () => {
    if (!loginUsername.trim() || !password) {
      setError('Enter your username and password to continue.');
      return;
    }
    setBusy(true);
    setError('');
    onMessage('');
    try {
      const identifier = loginUsername.trim().toLowerCase();
      const response = await apiRequest<AuthResponse>('/auth/login', undefined, {
        method: 'POST',
        body: JSON.stringify({accountType: 'farmer', username: identifier, password}),
      });
      await writeSecure('last-farmer-username', identifier).catch(() => undefined);
      await onAuthenticated(response);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not sign in right now.');
    } finally {
      setBusy(false);
    }
  };

  const renderFarmFields = () => <>
    <Field label="Farm / plot name *" value={fields.propertyName} onChangeText={value => setField('propertyName', value)} placeholder="Farm name or landmark" autoCapitalize="words" />
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
    <Text style={styles.helperText}>After you finish the address and leave this field, RSSI suggests a map pin. Review it and move the pin to your farm.</Text>
    {addressLookupMessage ? <Text style={styles.helperText}>{addressLookupMessage}</Text> : null}
    <Text style={[styles.inputLabel, styles.locationPickerTitle]}>Choose your exact farm location</Text>
    <Notice text="After you choose a barangay, RSSI will place a pin at your current location. Use two fingers to move the map under the fixed center pin." tone="info" />
    <LocationPicker value={coordinates} onChange={moveMapPin} />
    {locationBusy ? <Text style={styles.helperText}>Getting your current location…</Text> : null}
    {locationMessage ? <Text style={styles.helperText}>{locationMessage}</Text> : null}
    {coordinates ? <View style={styles.coordinatesWrap}>
      <Text style={styles.coordinatesText}>Selected farm pin</Text>
      <Text style={styles.coordinatesText}>{coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}</Text>
      {coordinates.accuracy !== undefined ? <Text style={styles.helperText}>Device GPS accuracy: ±{Math.round(coordinates.accuracy)} m</Text> : null}
    </View> : null}
    <Text style={styles.helperText}>Map tiles require an internet connection.</Text>
    <ToggleLine
      title="Show this farm in SRA Map Monitoring"
      description="Save a pin for authorized SRA staff only. Leave this off to keep the exact location private."
      value={preciseLocationConsent}
      onValueChange={setPreciseLocationConsent}
    />
    {preciseLocationConsent && !coordinates ? <Text style={styles.helperText}>Choose a point on the map or use current location before saving consent.</Text> : null}
    {fields.barangay ? <Button label={locationBusy ? 'Getting location…' : 'Use my current location'} kind="light" onPress={() => void captureLocation()} disabled={locationBusy} loading={locationBusy} /> : null}
  </>;

  const registrationSteps = ['Your name', 'Login details', 'Farm registration', 'Profile information'];
  const goBackStep = () => {
    if (registerStep > 0) {
      setRegisterStep(value => value - 1);
    }
    setError('');
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
            <Text style={styles.authTitle}>{isRegistering ? registrationSteps[registerStep] : 'Welcome back'}</Text>
            <Text style={styles.authSub}>
              {isRegistering
                ? 'Create your RSSI farmer account in a few quick steps.'
                : 'Sign in to view your farms and report sugarcane observations.'}
            </Text>
            {error ? <Notice text={error} tone="error" /> : null}
            {isRegistering ? <>
              <View style={styles.authStepBadge}><Pill text={`STEP ${registerStep + 1} OF 4`} tone="blue" /><Text style={styles.helperText}>{registrationSteps[registerStep]}</Text></View>
              {registerStep === 0 ? <>
                <Field label="Full name *" value={fields.name} onChangeText={value => setField('name', value)} placeholder="Enter your full name" autoCapitalize="words" />
                <Text style={styles.helperText}>Enter the name you use for your farmer account and reports.</Text>
              </> : null}
              {registerStep === 1 ? <>
                <Field label="Username for login *" value={fields.username} onChangeText={value => setField('username', value.replace(/\s/g, '').toLowerCase())} placeholder="Choose a username" autoCapitalize="none" />
                <Text style={styles.helperText}>Use this username whenever you sign in. Add your email address in profile information.</Text>
                <Field label="Password (10 characters minimum) *" value={fields.password} onChangeText={value => setField('password', value)} placeholder="Create a password" secureTextEntry autoCapitalize="none" />
              </> : null}
              {registerStep === 2 ? <>
                <Text style={styles.bodyText}>Would you like to register a farm now? You can add one later from your account.</Text>
                <View style={styles.choiceRow}>
                  <Choice label="Add a farm now" active={addFarm} onPress={() => setAddFarm(true)} compact />
                  <Choice label="I’ll do this later" active={!addFarm} onPress={() => setAddFarm(false)} compact />
                </View>
                {addFarm ? renderFarmFields() : null}
              </> : null}
              {registerStep === 3 ? <>
                <Field label="Email address *" value={fields.email} onChangeText={value => setField('email', value)} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
                <Text style={styles.helperText}>Your email is saved as account contact information. Sign-in always uses your username.</Text>
                <Field label="Phone number *" value={fields.phoneNumber} onChangeText={value => setField('phoneNumber', value)} placeholder="09XX XXX XXXX" keyboardType="numeric" autoCapitalize="none" />
                <ProfilePhotoPicker name={fields.name} selectedPhoto={profilePhoto} onSelect={setProfilePhoto} disabled={busy} />
                <Text style={styles.helperText}>When you create your account, RSSI will sign you in automatically.</Text>
              </> : null}
              <View style={styles.buttonRow}>
                {registerStep > 0 ? <View style={styles.flex}><Button label="Back" kind="light" onPress={goBackStep} disabled={busy} /></View> : null}
                <View style={styles.flex}><Button label={busy ? 'Creating account…' : registerStep === 3 ? 'Create account' : 'Next'} onPress={() => registerStep === 3 ? void finishRegistration() : continueRegistration()} disabled={busy || addressLookupBusy} loading={busy || addressLookupBusy} /></View>
              </View>
            </> : <>
              {loginUsername ? <View style={styles.loginAccountCard}>
                <Text style={styles.inputLabel}>Signing in as</Text>
                <Text style={styles.loginAccountName}>{loginUsername}</Text>
                <TouchableOpacity style={styles.authAccountLink} onPress={() => {setLoginUsername(''); void removeSecure('last-farmer-username');}}><Text style={styles.linkText}>Use another username</Text></TouchableOpacity>
              </View> : <Field label="Username" value={loginUsername} onChangeText={setLoginUsername} placeholder="Your username" autoCapitalize="none" />}
              <Field label="Password" value={password} onChangeText={setPassword} placeholder="Your password" secureTextEntry autoCapitalize="none" />
              <Button label={busy ? 'Connecting…' : 'Sign in'} onPress={() => void signIn()} disabled={busy} loading={busy} />
            </>}
            <TouchableOpacity style={styles.linkButton} onPress={() => {setMode(isRegistering ? 'login' : 'register'); if (!isRegistering) setRegisterStep(0); setError('');}}>
              <Text style={styles.linkText}>{isRegistering ? 'Already registered? Sign in' : 'New to RSSI? Create an account'}</Text>
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

