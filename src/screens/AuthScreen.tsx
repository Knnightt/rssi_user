import React, {useEffect, useRef, useState} from 'react';
import {BackHandler, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, View} from 'react-native';
import {Asset} from 'react-native-image-picker';
import {SafeAreaView} from 'react-native-safe-area-context';
import {ApiError, apiRequest, AuthResponse, geocodeFarmAddress, geocodeFarmBarangayLocation, reverseGeocodeFarmLocation, uploadProfilePhoto} from '../api';
<<<<<<< HEAD
import {captureFarmCoordinates, farmLocationSourceLabel, FarmBoundaryPoint, FarmCoordinates} from '../location';
=======
import {captureFarmCoordinates, FarmCoordinates} from '../location';
>>>>>>> 0f32d7920b4a39294cbfa095bd4eb763bdbb25db
import {LocationPicker} from '../components/LocationPicker';
import {FarmCoordinateFields} from '../components/FarmCoordinateFields';
import {DropdownField} from '../components/DropdownField';
import negrosLocations from '../data/negrosLocations.json';
import {styles} from '../theme';
import {RegisterFields} from '../types';
import {BrandMark, Button, CheckBoxLine, Choice, Field, LanguageSwitcher, LoadingScreen, Notice, Pill, ProfilePhotoPicker, ToggleLine} from '../components/UI';
import {LocalizedText as Text, useLanguage} from '../i18n';
import {useTheme} from '../theme';
import {readSecure, writeSecure} from '../secureStorage';

type SupportedProvince = keyof typeof negrosLocations;

function normalizeLocationName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/^(province of|city of|municipality of|barangay|brgy\.?|bgy\.?)\s+/, '')
    .replace(/\s+(city|municipality|province)$/, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function matchLocationChoice(values: string[], choices: string[]): string {
  for (const value of values) {
    const normalized = normalizeLocationName(value);
    if (!normalized) continue;
    const match = choices.find(choice => normalizeLocationName(choice) === normalized);
    if (match) return match;
  }
  return '';
}

function resolveFarmAddress(address: Record<string, string>) {
  const provinceValues = [address.province, address.state, address.region, address.state_district, address.county].filter((value): value is string => Boolean(value));
  const municipalityValues = [address.city, address.town, address.municipality, address.city_district, address.county, address.state_district, address.district].filter((value): value is string => Boolean(value));
  const barangayValues = [address.barangay, address.suburb, address.quarter, address.neighbourhood, address.neighborhood, address.village, address.hamlet, address.residential, address.city_district].filter((value): value is string => Boolean(value));
  let province = matchLocationChoice(provinceValues, Object.keys(negrosLocations)) as SupportedProvince | '';
  if (!province) {
    const matchingProvinces = (Object.keys(negrosLocations) as SupportedProvince[])
      .filter(candidate => matchLocationChoice(municipalityValues, negrosLocations[candidate].map(item => item.name)) !== '');
    if (matchingProvinces.length === 1) province = matchingProvinces[0];
  }
  if (!province) return {province: '', municipality: '', barangay: ''};

  const municipalities = negrosLocations[province];
  const municipality = matchLocationChoice(municipalityValues, municipalities.map(item => item.name));
  if (!municipality) return {province, municipality: '', barangay: ''};

  const selectedMunicipality = municipalities.find(item => item.name === municipality);
  const barangay = matchLocationChoice(barangayValues, selectedMunicipality?.barangays || []);
  return {province, municipality, barangay};
}

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
  const {t} = useLanguage();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loginUsername, setLoginUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [registerStep, setRegisterStep] = useState(0);
  const [addFarm, setAddFarm] = useState(false);
  const [fields, setFields] = useState<RegisterFields>({
    name: '', username: '', email: '', phoneNumber: '', password: '', propertyName: '', province: 'Negros Oriental',
    municipality: '', barangay: '', address: '', sizeHectares: '',
  });
  const [profilePhoto, setProfilePhoto] = useState<Asset | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialMessage);
  const [resetStage, setResetStage] = useState<'request' | 'confirm' | null>(null);
  const [resetUsername, setResetUsername] = useState('');
  const [resetPhoneNumber, setResetPhoneNumber] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [passwordResetSuccess, setPasswordResetSuccess] = useState(false);
  const [registrationPolicyLoading, setRegistrationPolicyLoading] = useState(false);
  const [phoneVerificationRequired, setPhoneVerificationRequired] = useState(false);
  const [signupPhoneCodeSent, setSignupPhoneCodeSent] = useState(false);
  const [signupPhoneCode, setSignupPhoneCode] = useState('');
  const [signupPhoneVerificationToken, setSignupPhoneVerificationToken] = useState('');
  const [signupPhoneMessage, setSignupPhoneMessage] = useState('');
  const [preciseLocationConsent, setPreciseLocationConsent] = useState(false);
  const [coordinates, setCoordinates] = useState<FarmCoordinates | null>(null);
  const [boundaryCoordinates, setBoundaryCoordinates] = useState<FarmBoundaryPoint[]>([]);
  const [boundaryDrawing, setBoundaryDrawing] = useState(false);
  const [mapGestureActive, setMapGestureActive] = useState(false);
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

  useEffect(() => {
    if (!isRegistering) return;
    let mounted = true;
    setRegistrationPolicyLoading(true);
    void apiRequest<{phone_verification_required: boolean}>('/auth/registration-policy')
      .then(policy => {
        if (mounted) setPhoneVerificationRequired(policy.phone_verification_required === true);
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setRegistrationPolicyLoading(false);
      });
    return () => { mounted = false; };
  }, [isRegistering]);

  const setField = (key: keyof RegisterFields, value: string) => {
    setFields(current => ({...current, [key]: value}));
  };

  const changeRegistrationPhone = (phoneNumber: string) => {
    setField('phoneNumber', phoneNumber);
    setSignupPhoneCodeSent(false);
    setSignupPhoneCode('');
    setSignupPhoneVerificationToken('');
    setSignupPhoneMessage('');
  };

  const captureLocation = async () => {
    const revision = ++locationRequestRevision.current;
    addressLookupRevision.current += 1;
    geocodedAddressKey.current = '';
    setAddressLookupBusy(false);
    setAddressLookupMessage('');
    setLocationBusy(true);
    setLocationMessage('Getting your device location…');
    try {
      const currentLocation = await captureFarmCoordinates();
      if (revision !== locationRequestRevision.current) return;
      setCoordinates(currentLocation);
      setLocationMessage('Location found. Filling the address fields…');
      try {
        const reverseGeocode = await reverseGeocodeFarmLocation(currentLocation);
        if (revision !== locationRequestRevision.current) return;
        const resolved = resolveFarmAddress(reverseGeocode.address);
        setFields(current => ({
          ...current,
          ...resolved,
          address: reverseGeocode.displayName,
        }));
        setLocationMessage(resolved.province && resolved.municipality && resolved.barangay
          ? 'Address and map pin filled from your device location. Check the details and adjust them or move the pin if needed.'
          : 'Map pin and address filled. Some location choices could not be matched; select the missing province, municipality, or barangay and review the pin.');
      } catch (addressError) {
        if (revision !== locationRequestRevision.current) return;
        setLocationMessage(`${addressError instanceof Error ? addressError.message : 'Could not look up the address.'} The map pin is set; you can fill the address manually.`);
      }
    } catch (locationError) {
      if (revision === locationRequestRevision.current) setLocationMessage(locationError instanceof Error ? locationError.message : 'Could not read the farm location.');
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
      setCoordinates({latitude: result.latitude, longitude: result.longitude, source: 'address_lookup'});
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
    setBoundaryCoordinates([]);
    setBoundaryDrawing(false);
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
    setBoundaryCoordinates([]);
    setBoundaryDrawing(false);
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
    setBoundaryCoordinates([]);
    setBoundaryDrawing(false);
    setLocationMessage('');
    setAddressLookupMessage('');
    setAddressLookupBusy(false);
    setLocationBusy(false);
  };

  const selectBarangay = async (barangay: string) => {
    addressLookupRevision.current += 1;
    const revision = ++locationRequestRevision.current;
    geocodedAddressKey.current = '';
    setAddressLookupBusy(false);
    setAddressLookupMessage('');
    setField('barangay', barangay);
    setCoordinates(null);
    setBoundaryCoordinates([]);
    setBoundaryDrawing(false);
    setLocationBusy(true);
    setLocationMessage('Finding this barangay on the map…');
    try {
      const result = await geocodeFarmBarangayLocation({
        province: fields.province,
        municipality: fields.municipality,
        barangay,
      });
      if (revision === locationRequestRevision.current) {
        setCoordinates({latitude: result.latitude, longitude: result.longitude, source: 'address_lookup'});
        setLocationMessage(`Map centered on ${barangay}. Move the pin if your farm is elsewhere.`);
      }
    } catch (lookupError) {
      if (revision === locationRequestRevision.current) {
        setLocationMessage(lookupError instanceof Error ? lookupError.message : 'Could not find this barangay on the map. You can still move the map manually.');
      }
    } finally {
      if (revision === locationRequestRevision.current) setLocationBusy(false);
    }
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
      if (!confirmPassword) {
        setError('Confirm your password to continue.');
        return;
      }
      if (fields.password !== confirmPassword) {
        setError('The passwords do not match. Check both fields and try again.');
        return;
      }
      setField('username', normalizedUsername);
      setRegisterStep(2);
      return;
    }
    if (registerStep === 2) {
      if (addFarm) {
        const farmArea = Number(fields.sizeHectares);
        if (!fields.propertyName.trim() || !fields.province.trim() || !fields.municipality.trim() || !fields.barangay.trim() || !fields.address.trim() || !fields.sizeHectares.trim() || !Number.isFinite(farmArea) || farmArea <= 0) {
          setError('Complete the farm name, province, municipality, barangay, address and area, or choose to add the farm later.');
          return;
        }
        if (preciseLocationConsent && !coordinates && boundaryCoordinates.length < 3) {
          setError('Choose a point on the map or draw at least three boundary corners before sharing the exact location.');
          return;
        }
      }
      setRegisterStep(3);
    }
  };

  const finishRegistration = async () => {
    if (!agreedToTerms) {
      setError('You must agree to the Terms and Conditions before creating your account.');
      return;
    }
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
      let verificationRequired = false;
      try {
        const policy = await apiRequest<{phone_verification_required: boolean}>('/auth/registration-policy');
        verificationRequired = policy.phone_verification_required === true;
      } catch {
        // The registration endpoint remains authoritative if the policy request is unavailable.
      }
      setPhoneVerificationRequired(verificationRequired);
      if (verificationRequired && !signupPhoneVerificationToken) {
        setError('Verify your phone number before creating the account.');
        return;
      }

      const body: Record<string, unknown> = {
        name: fields.name.trim(),
        username: fields.username.trim().toLowerCase(),
        phoneNumber: phone,
        password: fields.password,
        email,
      };
      if (signupPhoneVerificationToken) body.phoneVerificationToken = signupPhoneVerificationToken;
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
          boundaryCoordinates: preciseLocationConsent ? boundaryCoordinates : [],
          locationSource: preciseLocationConsent && boundaryCoordinates.length >= 3 ? 'boundary' : preciseLocationConsent && coordinates ? coordinates.source || 'unknown' : 'unknown',
          gpsAccuracyMeters: preciseLocationConsent && boundaryCoordinates.length < 3 && coordinates?.source === 'gps' ? coordinates.accuracy ?? null : null,
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
      if (requestError instanceof ApiError && requestError.code === 'phone_verification_required') {
        setPhoneVerificationRequired(true);
        setSignupPhoneVerificationToken('');
        setSignupPhoneCodeSent(false);
        setSignupPhoneMessage('The workspace now requires phone verification. Send a code to continue.');
        setError('Verify your phone number before creating the account.');
        return;
      }
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

  const requestSignupPhoneCode = async () => {
    if (!fields.phoneNumber.trim()) {
      setError('Enter your phone number first.');
      return;
    }
    setBusy(true);
    setError('');
    setSignupPhoneMessage('');
    try {
      const response = await apiRequest<{message: string}>('/auth/phone-verification/request', undefined, {
        method: 'POST',
        body: JSON.stringify({phoneNumber: fields.phoneNumber.trim()}),
      });
      setSignupPhoneCodeSent(true);
      setSignupPhoneCode('');
      setSignupPhoneVerificationToken('');
      setSignupPhoneMessage(response.message);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.code === 'phone_verification_disabled') {
        setPhoneVerificationRequired(false);
        setSignupPhoneCodeSent(false);
      }
      setError(requestError instanceof Error ? requestError.message : 'Could not send a verification SMS right now.');
    } finally {
      setBusy(false);
    }
  };

  const confirmSignupPhoneCode = async () => {
    if (!/^\d{6}$/.test(signupPhoneCode.trim())) {
      setError('Enter the 6-digit code from the SMS.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await apiRequest<{phone_verification_token: string}>('/auth/phone-verification/confirm', undefined, {
        method: 'POST',
        body: JSON.stringify({phoneNumber: fields.phoneNumber.trim(), code: signupPhoneCode.trim()}),
      });
      setSignupPhoneVerificationToken(response.phone_verification_token);
      setSignupPhoneMessage('Phone number verified. You can create your account.');
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.code === 'phone_verification_disabled') {
        setPhoneVerificationRequired(false);
        setSignupPhoneCodeSent(false);
        setSignupPhoneVerificationToken('');
      }
      setError(requestError instanceof Error ? requestError.message : 'Could not verify this phone number.');
    } finally {
      setBusy(false);
    }
  };

  const openPasswordReset = () => {
    setResetUsername(loginUsername);
    setResetStage('request');
    setResetMessage('');
    setPasswordResetSuccess(false);
    setError('');
  };

  const requestPasswordReset = async () => {
    if (!resetUsername.trim() || !resetPhoneNumber.trim()) {
      setError('Enter your username and the phone number on your account.');
      return;
    }
    setBusy(true);
    setError('');
    setResetMessage('');
    try {
      await apiRequest<{message: string}>('/auth/password-reset/request', undefined, {
        method: 'POST',
        body: JSON.stringify({username: resetUsername.trim().toLowerCase(), phoneNumber: resetPhoneNumber.trim()}),
      });
      setResetUsername(value => value.trim().toLowerCase());
      setResetStage('confirm');
      setResetMessage('If the account details match, a verification code has been sent.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not request a reset code right now.');
    } finally {
      setBusy(false);
    }
  };

  const confirmPasswordReset = async () => {
    if (!/^\d{6}$/.test(resetCode.trim())) {
      setError('Enter the 6-digit code from the SMS.');
      return;
    }
    if (resetPassword.length < 10) {
      setError('Choose a password with at least 10 characters.');
      return;
    }
    if (resetPassword !== resetConfirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiRequest<{message: string}>('/auth/password-reset/confirm', undefined, {
        method: 'POST',
        body: JSON.stringify({
          username: resetUsername.trim().toLowerCase(),
          phoneNumber: resetPhoneNumber.trim(),
          code: resetCode.trim(),
          newPassword: resetPassword,
          confirmPassword: resetConfirmPassword,
        }),
      });
      setLoginUsername(resetUsername.trim().toLowerCase());
      setPassword('');
      setResetStage(null);
      setResetCode('');
      setResetPassword('');
      setResetConfirmPassword('');
      setResetMessage('');
      setPasswordResetSuccess(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not reset the password right now.');
    } finally {
      setBusy(false);
    }
  };

  const renderFarmFields = () => <>
    <Button label={locationBusy ? 'Getting device location…' : 'Use device location to fill farm details'} onPress={() => void captureLocation()} disabled={locationBusy} loading={locationBusy} />
    {locationMessage ? <Text style={styles.helperText}>{locationMessage}</Text> : null}
    <Field label="Farm / plot name *" value={fields.propertyName} onChangeText={value => setField('propertyName', value)} placeholder="Farm name or landmark" autoCapitalize="words" autoCorrect={false} />
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
      <View style={styles.fieldNarrow}><Field label="Farm area (ha) *" value={fields.sizeHectares} onChangeText={value => setField('sizeHectares', value.replace(/[^0-9.]/g, ''))} placeholder="0.00" keyboardType="decimal-pad" autoCorrect={false} /></View>
    </View>
    <Field label="Complete farm address *" value={fields.address} onChangeText={changeAddress} onBlur={() => void locateEnteredAddress()} placeholder="House / lot, sitio or purok, barangay, municipality, province" multiline autoCapitalize="words" autoCorrect={false} />
    {addressLookupMessage ? <Text style={styles.helperText}>{addressLookupMessage}</Text> : null}
    <Text style={[styles.inputLabel, styles.locationPickerTitle]}>Choose your exact farm location</Text>
<<<<<<< HEAD
    <Notice text="Drag with one finger to move the map. Pinch with two fingers to zoom. Tap to place the pin." tone="info" />
    <LocationPicker value={coordinates} onChange={moveMapPin} boundary={boundaryCoordinates} boundaryDrawing={boundaryDrawing} onBoundaryChange={setBoundaryCoordinates} onGestureActive={setMapGestureActive} />
=======
    <LocationPicker value={coordinates} onChange={moveMapPin} onGestureActive={setMapGestureActive} />
>>>>>>> 0f32d7920b4a39294cbfa095bd4eb763bdbb25db
    <FarmCoordinateFields value={coordinates} onChange={moveMapPin} />
    {coordinates ? <View style={styles.coordinatesWrap}>
      <Text style={styles.coordinatesText}>Selected farm pin</Text>
      {coordinates.source === 'gps' && coordinates.accuracy !== undefined ? <Text style={styles.helperText}>{t('GPS accuracy')}: ±{Math.round(coordinates.accuracy)} m</Text> : null}
    </View> : null}
    <ToggleLine
      title="Show this farm in SRA Map Monitoring"
<<<<<<< HEAD
      description="Share this farm's exact pin or drawn outline with authorized SRA staff only. Leave this off to keep exact coordinates private."
=======
      description=""
>>>>>>> 0f32d7920b4a39294cbfa095bd4eb763bdbb25db
      value={preciseLocationConsent}
      onValueChange={value => {setPreciseLocationConsent(value); if (!value) {setCoordinates(null); setBoundaryCoordinates([]); setBoundaryDrawing(false);}}}
    />
    {preciseLocationConsent ? <>
      <Text style={styles.helperText}>Tap the farm corners in order to outline its actual area. At least three corners are needed.</Text>
      <View style={styles.buttonRow}>
        <Button label={boundaryDrawing ? t('Finish boundary') : t('Draw farm boundary')} kind="light" onPress={() => setBoundaryDrawing(active => !active)} />
        <Button label={t('Undo corner')} kind="light" disabled={!boundaryCoordinates.length} onPress={() => setBoundaryCoordinates(points => points.slice(0, -1))} />
        <Button label={t('Clear boundary')} kind="light" disabled={!boundaryCoordinates.length} onPress={() => {setBoundaryCoordinates([]); setBoundaryDrawing(false);}} />
      </View>
      <Text style={styles.helperText}>{boundaryCoordinates.length} {t('boundary corners')}</Text>
      {boundaryCoordinates.length >= 3 ? <Text style={styles.helperText}>Farm area will be calculated from the outline when saved.</Text> : !coordinates ? <Text style={styles.helperText}>Choose a pin or draw at least three corners before continuing.</Text> : null}
    </> : <Text style={styles.helperText}>Enable map sharing above to draw and save an exact farm boundary.</Text>}
  </>;

  const registrationSteps = ['Your name', 'Login details', 'Farm registration', 'Profile information'];
  const isResetting = resetStage !== null;
  const goBackStep = () => {
    if (registerStep > 0) {
      setRegisterStep(value => value - 1);
    }
    setError('');
  };
  const handleRegistrationBack = () => {
    if (registerStep > 0) {
      goBackStep();
    } else {
      setMode('login');
      setError('');
    }
  };

  const handleAuthBack = () => {
    if (resetStage === 'confirm') {
      setResetStage('request');
      setResetMessage('');
    } else if (resetStage === 'request') {
      setResetStage(null);
    } else {
      handleRegistrationBack();
    }
    setError('');
  };

  useEffect(() => {
    if (!isRegistering && !isResetting) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isResetting && resetStage === 'confirm') {
        setResetStage('request');
      } else if (isRegistering && registerStep > 0) {
        setRegisterStep(step => step - 1);
      } else if (isResetting) {
        setResetStage(null);
      } else {
        setMode('login');
      }
      setError('');
      return true;
    });
    return () => subscription.remove();
  }, [isRegistering, isResetting, registerStep, resetStage]);

  return (
    <SafeAreaView style={styles.authRoot}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" scrollEnabled={!mapGestureActive}>
          <View style={styles.authBrandRow}>
            {isRegistering || isResetting ? <TouchableOpacity style={styles.authBackButton} onPress={handleAuthBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={6}>
              <Text style={styles.authBackText}>‹</Text>
            </TouchableOpacity> : null}
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
<<<<<<< HEAD
            <Text style={styles.authTitle}>{isRegistering ? registrationSteps[registerStep] : isResetting ? 'Reset password' : 'Welcome back'}</Text>
            <Text style={styles.authSub}>
              {isRegistering
                ? 'Create your RSSI farmer account in a few quick steps.'
                : isResetting
                  ? 'Verify your account phone number, then choose a new password.'
                  : 'Sign in to view your farms and report sugarcane observations.'}
            </Text>
            {passwordResetSuccess && !isResetting ? <Notice text="Password updated. Sign in with your new password." tone="success" /> : null}
=======
            <Text style={styles.authTitle}>{isRegistering ? registrationSteps[registerStep] : 'Welcome back'}</Text>
>>>>>>> 0f32d7920b4a39294cbfa095bd4eb763bdbb25db
            {error ? <Notice text={error} tone="error" /> : null}
            {isRegistering ? <>
              <View style={styles.authStepBadge}><Pill text={`STEP ${registerStep + 1} OF 4`} tone="blue" /></View>
              {registerStep === 0 ? <>
                <Field label="Full name *" value={fields.name} onChangeText={value => setField('name', value)} placeholder="Enter your full name" autoCapitalize="words" autoCorrect={false} />
              </> : null}
              {registerStep === 1 ? <>
                <Field label="Username for login *" value={fields.username} onChangeText={value => setField('username', value)} placeholder="Choose a username" autoCapitalize="none" autoCorrect={false} />
                <Field label="Password (10 characters minimum) *" value={fields.password} onChangeText={value => setField('password', value)} placeholder="Create a password" secureTextEntry showPasswordToggle autoCapitalize="none" autoCorrect={false} />
                <Field label="Confirm password *" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Enter your password again" secureTextEntry showPasswordToggle autoCapitalize="none" autoCorrect={false} />
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
                <Field label="Email address *" value={fields.email} onChangeText={value => setField('email', value)} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
<<<<<<< HEAD
                <Text style={styles.helperText}>Your email is saved as account contact information. Sign-in always uses your username.</Text>
                <Field label="Phone number *" value={fields.phoneNumber} onChangeText={changeRegistrationPhone} placeholder="09XX XXX XXXX" keyboardType="numeric" autoCapitalize="none" autoCorrect={false} />
                {phoneVerificationRequired ? <View>
                  {signupPhoneVerificationToken ? <Notice text={signupPhoneMessage || 'Phone number verified.'} tone="success" /> : <>
                    <Text style={styles.helperText}>This workspace requires SMS verification before registration. The code expires after 10 minutes.</Text>
                    <Button label={signupPhoneCodeSent ? 'Resend verification code' : 'Send verification code'} kind="light" onPress={() => void requestSignupPhoneCode()} disabled={busy || registrationPolicyLoading} loading={busy} />
                    {signupPhoneCodeSent ? <>
                      <Field label="6-digit verification code" value={signupPhoneCode} onChangeText={value => setSignupPhoneCode(value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" keyboardType="numeric" maxLength={6} autoCapitalize="none" autoCorrect={false} />
                      <Button label={busy ? 'Verifying…' : 'Verify phone number'} kind="light" onPress={() => void confirmSignupPhoneCode()} disabled={busy} loading={busy} />
                    </> : null}
                  </>}
                  {signupPhoneMessage && !signupPhoneVerificationToken ? <Notice text={signupPhoneMessage} tone="info" /> : null}
                </View> : null}
=======
                <Field label="Phone number *" value={fields.phoneNumber} onChangeText={value => setField('phoneNumber', value)} placeholder="09XX XXX XXXX" keyboardType="numeric" autoCapitalize="none" autoCorrect={false} />
>>>>>>> 0f32d7920b4a39294cbfa095bd4eb763bdbb25db
                <ProfilePhotoPicker name={fields.name} selectedPhoto={profilePhoto} onSelect={setProfilePhoto} disabled={busy} />
                <CheckBoxLine label={t('I have read and agree to the Terms and Conditions.')} checked={agreedToTerms} onToggle={() => setAgreedToTerms(value => !value)} />
              </> : null}
              <View style={styles.buttonRow}>
                {registerStep > 0 ? <View style={styles.flex}><Button label="Back" kind="light" onPress={goBackStep} disabled={busy} /></View> : null}
                <View style={styles.flex}><Button label={busy ? 'Creating account…' : registerStep === 3 ? 'Create account' : 'Next'} onPress={() => registerStep === 3 ? void finishRegistration() : continueRegistration()} disabled={busy || addressLookupBusy || (registerStep === 3 && registrationPolicyLoading)} loading={busy || addressLookupBusy} /></View>
              </View>
            </> : resetStage === 'request' ? <>
              <Field label="Username" value={resetUsername} onChangeText={setResetUsername} placeholder="Your username" autoCapitalize="none" autoCorrect={false} />
              <Field label="Phone number on your account" value={resetPhoneNumber} onChangeText={setResetPhoneNumber} placeholder="09XX XXX XXXX" keyboardType="numeric" maxLength={25} autoCapitalize="none" autoCorrect={false} />
              <Text style={styles.helperText}>We’ll text a one-time code to the phone number saved on this account. The message won’t reveal whether the details match.</Text>
              <Button label={busy ? 'Sending code…' : 'Send verification code'} onPress={() => void requestPasswordReset()} disabled={busy} loading={busy} />
            </> : resetStage === 'confirm' ? <>
              {resetMessage ? <Notice text={resetMessage} tone="info" /> : null}
              <Field label="6-digit verification code" value={resetCode} onChangeText={value => setResetCode(value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" keyboardType="numeric" maxLength={6} autoCapitalize="none" autoCorrect={false} />
              <Field label="New password (10 characters minimum)" value={resetPassword} onChangeText={setResetPassword} placeholder="Create a new password" secureTextEntry showPasswordToggle autoCapitalize="none" autoCorrect={false} />
              <Field label="Confirm new password" value={resetConfirmPassword} onChangeText={setResetConfirmPassword} placeholder="Enter your new password again" secureTextEntry showPasswordToggle autoCapitalize="none" autoCorrect={false} />
              <Button label={busy ? 'Updating password…' : 'Update password'} onPress={() => void confirmPasswordReset()} disabled={busy} loading={busy} />
            </> : <>
              <Field label="Username" value={loginUsername} onChangeText={setLoginUsername} placeholder="Your username" autoCapitalize="none" autoCorrect={false} />
              <Field label="Password" value={password} onChangeText={setPassword} placeholder="Your password" secureTextEntry showPasswordToggle autoCapitalize="none" />
              <Button label={busy ? 'Connecting…' : 'Sign in'} onPress={() => void signIn()} disabled={busy} loading={busy} />
              <TouchableOpacity style={styles.linkButton} onPress={openPasswordReset} accessibilityRole="button">
                <Text style={styles.linkText}>Forgot password?</Text>
              </TouchableOpacity>
            </>}
            {isRegistering || !isResetting ? <TouchableOpacity style={styles.linkButton} onPress={() => {setMode(isRegistering ? 'login' : 'register'); if (!isRegistering) setRegisterStep(0); setPasswordResetSuccess(false); setError('');}}>
              <Text style={styles.linkText}>{isRegistering ? 'Already registered? Sign in' : 'New to RSSI? Create an account'}</Text>
            </TouchableOpacity> : <TouchableOpacity style={styles.linkButton} onPress={() => {setResetStage(null); setError(''); setResetMessage('');}}>
              <Text style={styles.linkText}>Back to sign in</Text>
            </TouchableOpacity>}
          </View>
          <View style={styles.authFooter}>
            <Text style={styles.authFooterText}>SRA • Negros Oriental & Negros Occidental</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export {LoadingScreen};

