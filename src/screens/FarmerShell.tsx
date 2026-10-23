import React, {useEffect, useRef, useState} from 'react';
import {Image, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, Share, Text as NativeText, TextInput, TouchableOpacity, View} from 'react-native';
import RNFS from 'react-native-fs';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import type {Asset} from 'react-native-image-picker';
import {SafeAreaView} from 'react-native-safe-area-context';
import {apiRequest, CommunityUpdate, FarmProperty, Farmer, FieldReport, geocodeFarmBarangayLocation, reverseGeocodeFarmLocation, uploadProfilePhoto} from '../api';
import {captureFarmCoordinates, FarmCoordinates} from '../location';
import {LocationPicker} from '../components/LocationPicker';
import {DropdownField} from '../components/DropdownField';
import negrosLocations from '../data/negrosLocations.json';
import {createId, QueuedPhoto, QueuedReport, storePhoto} from '../reportQueue';
import {styles, useTheme} from '../theme';
import {Tab} from '../types';
import {Avatar, BrandMark, Button, Card, Choice, CommunityCard, EmptyState, FarmRow, Field, InfoRow, LanguageSwitcher, NavButton, Notice, PageIntro, Pill, PrivacyNote, ProfilePhotoPicker, QueuedReportRow, ReportRow, SeverityBadge, ThemeSwitcher, ToggleLine} from '../components/UI';
import {LocalizedText as Text, useLanguage} from '../i18n';

export default function FarmerShell(props: {
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
  onMessage: (message: string) => void;
  token: string;
  onReportQueued: (item: QueuedReport) => Promise<void>;
  onSync: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onLoadCommunity: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onUpdateFarmerName: (name: string) => Promise<void>;
  onProfilePhotoUpdated: (profilePhotoUrl: string | null) => Promise<void>;
  onCommunityConfirmed: (id: number) => Promise<void>;
}) {
  useTheme();
  const {t} = useLanguage();
  const {
    user, properties, reports, queue, community, tab, setTab,
    networkConnected, serverReachable, busy, notice, clearNotice, onMessage, token,
  } = props;
  const [farmForm, setFarmForm] = useState(false);
  const [farmBusy, setFarmBusy] = useState(false);
  const [farmMessage, setFarmMessage] = useState('');
  const [farmValues, setFarmValues] = useState({name: '', province: 'Negros Oriental', municipality: '', barangay: '', address: '', size: ''});
  const [farmLocationConsent, setFarmLocationConsent] = useState(false);
  const [farmCoordinates, setFarmCoordinates] = useState<FarmCoordinates | null>(null);
  const [farmLocationBusy, setFarmLocationBusy] = useState(false);
  const farmLocationRequest = useRef(0);
  const [farmMapGestureActive, setFarmMapGestureActive] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [locationEditProperty, setLocationEditProperty] = useState<FarmProperty | null>(null);
  const [selectedFarm, setSelectedFarm] = useState<number | null>(properties[0]?.id ?? null);
  const [observedAt, setObservedAt] = useState(localDate());
  const [observations, setObservations] = useState('');
  const [damage, setDamage] = useState('');
  const [severity, setSeverity] = useState('Mild');
  const [area, setArea] = useState('');
  const [locationDescription, setLocationDescription] = useState('');
  const [useFarmAddress, setUseFarmAddress] = useState(true);
  const [communityShare, setCommunityShare] = useState(false);
  const [photos, setPhotos] = useState<QueuedPhoto[]>([]);
  const [reportError, setReportError] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [reportSearch, setReportSearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState('All');
  const [selectedReport, setSelectedReport] = useState<FieldReport | null>(null);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileName, setProfileName] = useState(user.name);
  const [profilePhoto, setProfilePhoto] = useState<Asset | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');

  useEffect(() => {
    if (selectedFarm === null && properties.length > 0) {
      setSelectedFarm(properties[0].id);
    } else if (selectedFarm !== null && !properties.some(property => property.id === selectedFarm)) {
      setSelectedFarm(properties[0]?.id ?? null);
    }
  }, [properties, selectedFarm]);

  useEffect(() => {
    setProfileName(user.name);
  }, [user.name]);

  const selectedProperty = properties.find(property => property.id === selectedFarm) || properties[0];
  const refreshData = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await props.onRefresh();
    } catch {
      onMessage('Could not refresh RSSI data. Check your connection and try again.');
    } finally {
      setRefreshing(false);
    }
  };
  const filteredReports = reports.filter(report => {
    const query = reportSearch.trim().toLocaleLowerCase();
    const matchesQuery = !query || [report.code, report.property_name, report.province, report.municipality, report.observations, report.verification_status]
      .some(value => value.toLocaleLowerCase().includes(query));
    const status = report.verification_status.toLocaleLowerCase();
    const severityName = report.farmer_severity.toLocaleLowerCase();
    const matchesFilter = historyFilter === 'All'
      || (historyFilter === 'Pending' && !['confirmed', 'no detection', 'reviewed'].includes(status))
      || (historyFilter === 'Reviewed' && ['confirmed', 'no detection', 'reviewed'].includes(status))
      || (historyFilter === 'Severe' && ['severe', 'highly severe', 'high'].includes(severityName));
    return matchesQuery && matchesFilter;
  });
  const exportReports = async () => {
    if (reports.length === 0) {
      onMessage('There are no submitted reports to export yet.');
      return;
    }
    const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Report code', 'Farm', 'Province', 'Municipality', 'Observed date', 'Submitted date', 'Observation', 'Damage', 'Farmer severity', 'Affected area (ha)', 'SRA status', 'SRA severity'],
      ...reports.map(report => [report.code, report.property_name, report.province, report.municipality, report.observed_at, report.submitted_at, report.observations, report.damage_description, report.farmer_severity, report.affected_area_hectares, report.verification_status, report.sra_severity || '']),
    ];
    const csv = `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}`;
    const filePath = `${RNFS.DocumentDirectoryPath}/rssi-reports-${Date.now()}.csv`;
    try {
      await RNFS.writeFile(filePath, csv, 'utf8');
      if (Platform.OS === 'ios') {
        await Share.share({title: 'RSSI report export', url: `file://${filePath}`});
      } else {
        await Share.share({title: 'RSSI report export (CSV)', message: csv}, {dialogTitle: 'Export reports'});
      }
    } catch (error) {
      onMessage(error instanceof Error ? `Could not export reports: ${error.message}` : 'Could not export reports.');
    }
  };

  const saveProfileName = async () => {
    const trimmed = profileName.trim();
    if (!trimmed) {
      setProfileMessage('Enter your name before saving.');
      return;
    }
    setProfileBusy(true);
    setProfileMessage('');
    try {
      if (trimmed !== user.name) await props.onUpdateFarmerName(trimmed);
      if (profilePhoto) {
        const uploaded = await uploadProfilePhoto(token, profilePhoto);
        await props.onProfilePhotoUpdated(uploaded.profile_photo_url);
        setProfilePhoto(null);
      }
      setProfileEditing(false);
      setProfileMessage('Your profile was updated.');
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : 'Could not update your profile.');
    } finally {
      setProfileBusy(false);
    }
  };

  const saveFarm = async () => {
    const farmArea = Number(farmValues.size);
    if (!farmValues.name.trim() || !farmValues.municipality.trim() || !farmValues.barangay.trim() || !farmValues.size.trim() || !Number.isFinite(farmArea) || farmArea <= 0) {
      setFarmMessage('Enter a farm name, select a municipality and barangay, and enter a farm area greater than zero.');
      return;
    }
    if (farmLocationConsent && !farmCoordinates) {
      setFarmMessage(t('Choose a point on the map or use current location before saving consent.'));
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
          address: farmValues.address.trim() || null,
          sizeHectares: farmValues.size ? Number(farmValues.size) : null,
          latitude: farmLocationConsent ? farmCoordinates?.latitude ?? null : null,
          longitude: farmLocationConsent ? farmCoordinates?.longitude ?? null : null,
          locationConsent: farmLocationConsent,
        }),
      });
      setFarmValues({name: '', province: farmValues.province, municipality: '', barangay: '', address: '', size: ''});
      setFarmForm(false);
      setFarmMessage('Farm added to your account.');
      setFarmLocationConsent(false);
      setFarmCoordinates(null);
      await props.onRefresh().catch(() => undefined);
      setSelectedFarm(response.data.id);
    } catch (error) {
      setFarmMessage(error instanceof Error ? error.message : 'Could not save the farm.');
    } finally {
      setFarmBusy(false);
    }
  };

  const captureNewFarmLocation = () => {
    const request = ++farmLocationRequest.current;
    setFarmLocationBusy(true);
    setFarmMessage('');
    void captureFarmCoordinates()
      .then(coordinates => {
        if (request === farmLocationRequest.current) setFarmCoordinates(coordinates);
      })
      .catch(error => {
        if (request === farmLocationRequest.current) {
          setFarmMessage(error instanceof Error ? error.message : t('Could not read location.'));
        }
      })
      .finally(() => {
        if (request === farmLocationRequest.current) setFarmLocationBusy(false);
      });
  };

  const locateFarmFromPhone = async () => {
    const request = ++farmLocationRequest.current;
    setFarmLocationBusy(true);
    setFarmMessage('');
    try {
      const coordinates = await captureFarmCoordinates();
      if (request !== farmLocationRequest.current) return;
      setFarmCoordinates(coordinates);
      const result = await reverseGeocodeFarmLocation(coordinates);
      if (request !== farmLocationRequest.current) return;

      const normalizePlace = (value: string) => value.toLocaleLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/^municipality of\s+|^city of\s+|^barangay\s+/g, '')
        .replace(/\s+city$/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
      const provinceCandidates = [result.address.state_district, result.address.province, result.address.region, result.address.state, result.displayName]
        .filter((value): value is string => Boolean(value));
      const provinces = ['Negros Oriental', 'Negros Occidental'];
      const detectedProvince = provinces.find(province => provinceCandidates.some(value => {
        const normalizedValue = normalizePlace(value);
        const normalizedProvince = normalizePlace(province);
        return normalizedValue === normalizedProvince || normalizedValue.includes(normalizedProvince);
      }));
      const province = detectedProvince || farmValues.province;
      const municipalities = negrosLocations[province as keyof typeof negrosLocations] || [];
      const municipalityCandidates = [result.address.city, result.address.town, result.address.municipality, result.address.county, result.address.locality]
        .filter((value): value is string => Boolean(value));
      const municipality = municipalities.find(option => municipalityCandidates.some(candidate => {
        const normalizedOption = normalizePlace(option.name);
        const normalizedCandidate = normalizePlace(candidate);
        return normalizedOption === normalizedCandidate;
      }));
      const barangayCandidates = [result.address.suburb, result.address.neighbourhood, result.address.neighborhood, result.address.quarter, result.address.village, result.address.hamlet, result.address.residential]
        .filter((value): value is string => Boolean(value));
      const barangay = municipality?.barangays.find(option => barangayCandidates.some(candidate => {
        const normalizedOption = normalizePlace(option);
        const normalizedCandidate = normalizePlace(candidate);
        return normalizedOption === normalizedCandidate;
      }));

      setFarmValues(current => ({
        ...current,
        province,
        municipality: municipality?.name || '',
        barangay: barangay || '',
        address: result.displayName,
      }));
      if (!detectedProvince || !municipality || !barangay) {
        setFarmMessage('Phone location found. Review the address and choose any location fields that could not be matched automatically.');
      }
    } catch (error) {
      if (request === farmLocationRequest.current) {
        setFarmMessage(error instanceof Error ? error.message : 'Could not fill the address from your phone location.');
      }
    } finally {
      if (request === farmLocationRequest.current) setFarmLocationBusy(false);
    }
  };

  const selectFarmProvince = (province: string) => {
    farmLocationRequest.current += 1;
    setFarmLocationBusy(false);
    setFarmCoordinates(null);
    setFarmMessage('');
    setFarmValues(current => ({...current, province, municipality: '', barangay: ''}));
  };

  const selectFarmMunicipality = (municipality: string) => {
    farmLocationRequest.current += 1;
    setFarmLocationBusy(false);
    setFarmCoordinates(null);
    setFarmMessage('');
    setFarmValues(current => ({...current, municipality, barangay: ''}));
  };

  const selectFarmBarangay = async (barangay: string) => {
    const request = ++farmLocationRequest.current;
    setFarmCoordinates(null);
    setFarmValues(current => ({...current, barangay}));
    setFarmLocationBusy(true);
    setFarmMessage('Finding this barangay on the map…');
    try {
      const result = await geocodeFarmBarangayLocation({
        province: farmValues.province,
        municipality: farmValues.municipality,
        barangay,
      });
      if (request === farmLocationRequest.current) {
        setFarmCoordinates({latitude: result.latitude, longitude: result.longitude});
        setFarmMessage(`Map centered on ${barangay}. Move the pin if your farm is elsewhere.`);
      }
    } catch (error) {
      if (request === farmLocationRequest.current) {
        setFarmMessage(error instanceof Error ? error.message : 'Could not find this barangay on the map. You can still move the map manually.');
      }
    } finally {
      if (request === farmLocationRequest.current) setFarmLocationBusy(false);
    }
  };

  const openFarmLocationEditor = (property: FarmProperty) => {
    setFarmForm(false);
    setFarmMessage('');
    setLocationEditProperty(property);
    setFarmLocationConsent(property.location_consent);
    setFarmCoordinates(property.location_consent && property.latitude !== null && property.longitude !== null
      ? {latitude: Number(property.latitude), longitude: Number(property.longitude)}
      : null);
  };

  const saveFarmLocation = async () => {
    if (!locationEditProperty) return;
    if (farmLocationConsent && !farmCoordinates) {
      setFarmMessage(t('Choose a point on the map or use current location before saving consent.'));
      return;
    }
    setFarmBusy(true);
    setFarmMessage('');
    try {
      await apiRequest<{data: FarmProperty}>(`/farmers/me/properties/${locationEditProperty.id}/location`, token, {
        method: 'PATCH',
        body: JSON.stringify({
          latitude: farmCoordinates?.latitude ?? null,
          longitude: farmCoordinates?.longitude ?? null,
          locationConsent: farmLocationConsent,
        }),
      });
      setLocationEditProperty(null);
      setFarmCoordinates(null);
      setFarmLocationConsent(false);
      setFarmMessage(farmLocationConsent ? 'Farm location updated.' : 'Farm pin removed from SRA Map Monitoring.');
      await props.onRefresh().catch(() => undefined);
    } catch (error) {
      setFarmMessage(error instanceof Error ? error.message : 'Could not update the farm location.');
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
        locationDescription: useFarmAddress
          ? [selectedProperty.barangay, selectedProperty.municipality].filter(Boolean).join(', ')
          : locationDescription.trim() || null,
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
      setSeverity('Mild');
      setUseFarmAddress(true);
      setCommunityShare(false);
      setPhotos([]);
      setObservedAt(localDate());
    } catch (error) {
      setReportError(error instanceof Error ? error.message : 'Could not save this report on your device.');
    } finally {
      setReportBusy(false);
    }
  };

  const farmMunicipalityOptions = negrosLocations[farmValues.province as keyof typeof negrosLocations] || [];
  const farmBarangayOptions = farmMunicipalityOptions.find(item => item.name === farmValues.municipality)?.barangays || [];

  const createFarmForm = () => (
    <Card>
      <Text style={styles.cardTitle}>{locationEditProperty ? t('Update farm location') : farmForm ? t('Add a farm') : t('Your farms')}</Text>
      <Text style={styles.cardSub}>{locationEditProperty ? locationEditProperty.name : farmForm ? t('Add a farm you own or manage. Exact coordinates are not required.') : t('Only farms in your account are shown here.')}</Text>
      {farmMessage ? <Notice text={farmMessage} tone={farmMessage.includes('added') || farmMessage.includes('updated') || farmMessage.includes('removed') ? 'success' : 'error'} /> : null}
      {locationEditProperty ? (
        <>
          <ToggleLine
            title={t('Show this farm in SRA Map Monitoring')}
            description={t('Turn this on and save a pin to show this farm to authorized SRA staff. Leave it off to keep the exact location private.')}
            value={farmLocationConsent}
            onValueChange={value => {setFarmLocationConsent(value); if (!value) setFarmCoordinates(null);}}
          />
          {farmLocationConsent ? <>
            <Text style={styles.helperText}>{t('Drag with one finger to move the map. Pinch with two fingers to zoom. Tap to place the pin. Map tiles need internet.')}</Text>
            <LocationPicker value={farmCoordinates} onChange={setFarmCoordinates} onGestureActive={setFarmMapGestureActive} />
            <Button label={farmLocationBusy ? t('Getting location…') : farmCoordinates ? t('Farm pin selected') : t('Use current location')} kind="light" disabled={farmLocationBusy} loading={farmLocationBusy} onPress={() => {
              setFarmLocationBusy(true);
              void captureFarmCoordinates().then(setFarmCoordinates).catch(error => setFarmMessage(error instanceof Error ? error.message : t('Could not read location.'))).finally(() => setFarmLocationBusy(false));
            }} />
            {farmCoordinates ? <>
              <Text style={styles.coordinatesText}>GPS: {farmCoordinates.latitude.toFixed(5)}, {farmCoordinates.longitude.toFixed(5)}</Text>
              {farmCoordinates.accuracy !== undefined ? <Text style={styles.helperText}>Device GPS accuracy: ±{Math.round(farmCoordinates.accuracy)} m</Text> : null}
            </> : <Text style={styles.helperText}>{t('Choose a point on the map or use current location before saving consent.')}</Text>}
          </> : <Text style={styles.helperText}>{t('Save this change to remove the exact pin from SRA Map Monitoring.')}</Text>}
          {!networkConnected ? <Text style={styles.helperText}>{t('Adding a farm needs a connection. You can still save reports about farms already on your account.')}</Text> : null}
          <View style={styles.buttonRow}>
            <Button label={t('Cancel')} kind="light" onPress={() => {setLocationEditProperty(null); setFarmCoordinates(null); setFarmLocationConsent(false); setFarmMessage('');}} />
            <Button label={farmBusy ? t('Saving location…') : t('Save location')} onPress={saveFarmLocation} disabled={!networkConnected || farmBusy || (farmLocationConsent && !farmCoordinates)} loading={farmBusy} />
          </View>
        </>
      ) : farmForm ? (
        <>
          <Field label="Farm name" value={farmValues.name} onChangeText={value => setFarmValues(current => ({...current, name: value}))} placeholder="Your farm name" autoCapitalize="words" />
          <Text style={styles.helperText}>Your phone coordinates are sent to OpenStreetMap to look up nearby address details.</Text>
          <Button label={farmLocationBusy ? 'Getting phone location…' : 'Use phone location to fill address'} kind="light" disabled={farmLocationBusy} loading={farmLocationBusy} onPress={() => void locateFarmFromPhone()} />
          <Text style={styles.inputLabel}>Province</Text>
          <View style={styles.choiceRow}>
            {['Negros Oriental', 'Negros Occidental'].map(province => (
              <Choice key={province} label={province === 'Negros Oriental' ? 'Oriental' : 'Occidental'} active={farmValues.province === province} onPress={() => selectFarmProvince(province)} compact />
            ))}
          </View>
          <DropdownField
            label="Municipality / city"
            value={farmValues.municipality}
            options={farmMunicipalityOptions.map(item => item.name)}
            placeholder="Select your municipality or city"
            onSelect={selectFarmMunicipality}
          />
          <DropdownField
            label="Barangay *"
            value={farmValues.barangay}
            options={farmBarangayOptions}
            placeholder={farmValues.municipality ? 'Select your barangay' : 'Select a municipality first'}
            disabled={!farmValues.municipality}
            onSelect={selectFarmBarangay}
          />
          <Field label="Complete farm address" value={farmValues.address} onChangeText={value => setFarmValues(current => ({...current, address: value}))} placeholder="House / lot, sitio or purok, barangay, municipality, province" multiline autoCapitalize="words" />
          <Field label="Farm area (hectares) *" value={farmValues.size} onChangeText={value => setFarmValues(current => ({...current, size: value.replace(/[^0-9.]/g, '')}))} placeholder="0.00" keyboardType="decimal-pad" />
          <Text style={styles.helperText}>Required to size your farm circle on the map.</Text>
          <ToggleLine
            title={t('Show this farm in SRA Map Monitoring')}
            description={t('Turn this on and save a pin to show this farm to authorized SRA staff. Leave it off to keep the exact location private.')}
            value={farmLocationConsent}
            onValueChange={setFarmLocationConsent}
          />
          {farmValues.barangay || farmCoordinates ? <>
          <Text style={styles.helperText}>Drag with one finger to move the map. Pinch with two fingers to zoom. Tap to place the pin.</Text>
            <LocationPicker value={farmCoordinates} onChange={setFarmCoordinates} onGestureActive={setFarmMapGestureActive} />
            {farmLocationBusy ? <Text style={styles.helperText}>Getting your current location…</Text> : null}
            {farmCoordinates ? <>
              <Text style={styles.coordinatesText}>GPS: {farmCoordinates.latitude.toFixed(5)}, {farmCoordinates.longitude.toFixed(5)}</Text>
              {farmCoordinates.accuracy !== undefined ? <Text style={styles.helperText}>Device GPS accuracy: ±{Math.round(farmCoordinates.accuracy)} m</Text> : null}
            </> : !farmLocationBusy ? <Text style={styles.helperText}>Choose a point on the map or use current location.</Text> : null}
            <Button label={farmLocationBusy ? 'Getting location…' : 'Use current location'} kind="light" disabled={farmLocationBusy} loading={farmLocationBusy} onPress={captureNewFarmLocation} />
            {!farmLocationConsent ? <Text style={styles.helperText}>The pin is only saved when you enable location consent above.</Text> : null}
          </> : null}
          {!networkConnected ? <Text style={styles.helperText}>Adding a farm needs a connection. You can still save reports about farms already on your account.</Text> : null}
          <View style={styles.buttonRow}>
            <Button label="Cancel" kind="light" onPress={() => {setFarmForm(false); setFarmLocationConsent(false); setFarmCoordinates(null);}} />
            <Button label={t('Save farm')} onPress={saveFarm} disabled={!networkConnected || farmBusy || (farmLocationConsent && !farmCoordinates)} loading={farmBusy} />
          </View>
        </>
      ) : (
        <>
          <Button label="＋  Add a farm" kind="light" onPress={() => {setLocationEditProperty(null); setFarmForm(true); setFarmMessage(''); setFarmLocationConsent(false); setFarmCoordinates(null);}} />
          {properties.length === 0 ? <EmptyState icon="⌖" title="No farms added yet" description="Add your farm to start reporting field observations." /> : null}
          {properties.map(property => <View key={property.id}>
            <FarmRow property={property} onPress={() => setSelectedFarm(property.id)} selected={selectedFarm === property.id} />
            <TouchableOpacity style={styles.farmMapAction} onPress={() => openFarmLocationEditor(property)} accessibilityRole="button">
              <Text style={styles.linkText}>{t('Set or edit map pin')} →</Text>
            </TouchableOpacity>
          </View>)}
        </>
      )}
    </Card>
  );

  const farmsByProvince = properties.reduce<Record<string, number>>((counts, property) => {
    counts[property.province] = (counts[property.province] || 0) + 1;
    return counts;
  }, {});
  const screenTitle = tab === 'home' ? 'Dashboard'
    : tab === 'report' ? 'Submit report'
        : tab === 'history' ? 'My submitted reports'
          : tab === 'community' ? 'Updates'
            : tab === 'farms' ? 'Your farms'
              : tab === 'profile' ? 'My profile' : 'Help & support';

  const renderCurrentScreen = () => {
    switch (tab) {
      case 'home':
        return (
          <>
            <PageIntro eyebrow="RSSI FARMER MONITORING" title="Dashboard" subtitle={`Welcome back, ${user.name.split(' ')[0]}. Track your farms and field observations.`} />
            <TouchableOpacity style={styles.profileShortcut} onPress={() => setTab('profile')} accessibilityRole="button">
              <View style={styles.profileShortcutIcon}><Avatar name={user.name} photoUrl={user.profile_photo_url} photoCacheKey={user.profile_photo_cache_key} token={token} size={38} /></View>
              <View style={styles.flex}><Text style={styles.profileShortcutTitle}>My profile</Text><Text style={styles.profileShortcutSub}>View and edit your account information</Text></View>
              <Text style={styles.quickArrow}>›</Text>
            </TouchableOpacity>
            <Card>
              <View style={styles.cardTitleRow}><Text style={styles.cardTitle}>Coverage overview</Text><TouchableOpacity onPress={() => setTab('farms')}><Text style={styles.linkText}>My farms</Text></TouchableOpacity></View>
              <Text style={styles.cardSub}>Farm records linked to your account.</Text>
              {['Negros Oriental', 'Negros Occidental'].map(province => (
                <View key={province} style={styles.coverageRow}><Text style={styles.coverageArea}>{province}</Text><Pill text={`${farmsByProvince[province] || 0} farms`} tone="green" /></View>
              ))}
              <View style={styles.coverageRow}><Text style={styles.coverageArea}>Total monitored</Text><Pill text={`${properties.length} farms`} tone="blue" /></View>
            </Card>
            <Card>
              <View style={styles.cardTitleRow}><Text style={styles.cardTitle}>Crop damage severity</Text><Text style={styles.sectionHint}>Farmer estimate</Text></View>
              <View style={styles.severityLegend}>
                <View style={[styles.severityLegendItem, styles.severityMild]}><Text style={styles.severityLegendName}>Mild</Text><Text style={styles.severityLegendRange}>1–20% damage</Text></View>
                <View style={[styles.severityLegendItem, styles.severityModerate]}><Text style={styles.severityLegendName}>Moderate</Text><Text style={styles.severityLegendRange}>21–50% damage</Text></View>
                <View style={[styles.severityLegendItem, styles.severitySevere]}><Text style={styles.severityLegendName}>Severe</Text><Text style={styles.severityLegendRange}>51–70% damage</Text></View>
                <View style={[styles.severityLegendItem, styles.severityCritical]}><Text style={styles.severityLegendName}>Highly severe</Text><Text style={styles.severityLegendRange}>71–100% damage</Text></View>
              </View>
              <Text style={styles.helperText}>Severity reflects your observation. SRA review is recorded separately.</Text>
            </Card>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>My latest report</Text>
              <TouchableOpacity onPress={() => setTab('history')}><Text style={styles.linkText}>See all</Text></TouchableOpacity>
            </View>
            <Card>
              {reports.length === 0 && queue.length === 0 ? (
                <EmptyState icon="▤" title="No reports yet" description="When you submit a field observation, it will appear here." />
              ) : (
                <>
                  {queue.slice(0, 2).map(item => <QueuedReportRow key={item.clientSubmissionId} item={item} />)}
                  {reports.slice(0, 1).map(report => <ReportRow key={report.id} report={report} onPress={() => {setSelectedReport(report); setTab('history');}} />)}
                </>
              )}
            </Card>
            <PrivacyNote text="A farmer report is an observation for SRA review. It is not a confirmed RSSI finding." />
          </>
        );
      case 'farms':
        return (
          <>
            <PageIntro eyebrow="YOUR FARMS" title="Your farms" subtitle="Manage your farms and add another farm to your account." />
            {createFarmForm()}
            <Card>
              <Text style={styles.cardTitle}>Location privacy</Text>
              <Text style={styles.bodyText}>Farm addresses are visible to you and authorized SRA staff. Your exact GPS pin is optional and is only stored when you give consent.</Text>
            </Card>
          </>
        );
      case 'report':
        return (
          <>
            <PageIntro eyebrow="SUBMIT A SUGARCANE RSSI OBSERVATION" title="New field report" subtitle="Record what you observed. Your report stays an observation until reviewed by SRA." />
            {properties.length === 0 ? (
              <Card>
                <EmptyState icon="⌖" title="Add your farm first" description="A report must be linked to a farm in your account." />
                <Button label="Go to My farms" onPress={() => setTab('farms')} />
              </Card>
            ) : (
              <>
                <Card>
                  <Text style={styles.cardTitle}>Farm and location</Text>
                  <Text style={styles.cardSub}>Reports are saved to your account and kept private for SRA review.</Text>
                  <Text style={styles.inputLabel}>Farm / plot location *</Text>
                  {properties.map(property => (
                    <TouchableOpacity key={property.id} style={[styles.propertyOption, selectedFarm === property.id && styles.propertyOptionActive]} onPress={() => setSelectedFarm(property.id)}>
                      <View style={[styles.radio, selectedFarm === property.id && styles.radioActive]}>{selectedFarm === property.id ? <View style={styles.radioInner} /> : null}</View>
                      <View style={styles.flex}>
                        <NativeText style={styles.propertyOptionTitle}>{property.name}</NativeText>
                        <NativeText style={styles.propertyOptionSub}>{property.municipality} · {property.province}</NativeText>
                      </View>
                    </TouchableOpacity>
                  ))}
                  {selectedProperty ? <View style={styles.reportAddressCard}>
                    <Text style={styles.reportAddressTitle}>Farm address</Text>
                    <Text style={styles.reportAddressText}>{[selectedProperty.barangay, selectedProperty.municipality, selectedProperty.province].filter(Boolean).join(', ')}</Text>
                  </View> : null}
                  <ToggleLine title="Use default farm location" description="Uses the address saved with this farm. You can enter a field or block below." value={useFarmAddress} onValueChange={setUseFarmAddress} />
                  {!useFarmAddress ? <Field label="Field / block / landmark" value={locationDescription} onChangeText={setLocationDescription} placeholder="Field section or nearby landmark" autoCapitalize="words" /> : null}
                  <Text style={styles.inputLabel}>Observed severity <Text style={styles.requiredHint}>· Subject to SRA review</Text></Text>
                  <View style={styles.severityChoices}>
                    {[
                      {label: 'Mild', range: '1–20%', tone: styles.severityMild},
                      {label: 'Moderate', range: '21–50%', tone: styles.severityModerate},
                      {label: 'Severe', range: '51–70%', tone: styles.severitySevere},
                      {label: 'Highly severe', range: '71–100%', tone: styles.severityCritical},
                    ].map(option => (
                      <TouchableOpacity key={option.label} onPress={() => setSeverity(option.label)} style={[styles.severityChoice, option.tone, severity === option.label && styles.severityChoiceActive]} accessibilityRole="radio" accessibilityState={{selected: severity === option.label}}>
                        <Text style={styles.severityChoiceLabel}>{option.label}</Text><Text style={styles.severityChoiceRange}>{option.range} damage</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Field label="Description *" value={observations} onChangeText={setObservations} placeholder="Describe symptoms, affected area, or plant growth stage…" multiline />
                  <Field label="Damage details *" value={damage} onChangeText={setDamage} placeholder="What damage did you notice?" multiline />
                  <Field label="Observed date (YYYY-MM-DD) *" value={observedAt} onChangeText={setObservedAt} placeholder="2026-10-09" />
                  <Field label="Estimated affected area (ha)" value={area} onChangeText={value => setArea(value.replace(/[^0-9.]/g, ''))} placeholder="If you know it" keyboardType="decimal-pad" />
                </Card>
                <Card>
                  <View style={styles.cardTitleRow}><Text style={styles.cardTitle}>Photo evidence</Text><Pill text={`${photos.length} / 5`} tone="blue" /></View>
                  <Text style={styles.cardSub}>Photos are optional and are uploaded privately with your report.</Text>
                  {photos.length > 0 ? <View style={styles.photoGrid}>
                    {photos.map((photo, index) => <View key={photo.id} style={styles.photoTile}>
                      <Image source={{uri: photo.uri.startsWith('file://') ? photo.uri : `file://${photo.uri}`}} style={styles.photoThumbnail} />
                      <Text style={styles.photoTileCaption} numberOfLines={1}>Photo {index + 1}</Text>
                      <TouchableOpacity style={styles.photoRemove} onPress={() => setPhotos(current => current.filter(item => item.id !== photo.id))} accessibilityRole="button" accessibilityLabel={`Remove photo ${index + 1}`}><Text style={styles.photoRemoveText}>×</Text></TouchableOpacity>
                    </View>)}
                  </View> : null}
                  <View style={styles.photoActions}>
                    <Button label="Take photo" kind="light" onPress={() => void addPhoto('camera')} disabled={photos.length >= 5} />
                    <Button label="Choose photos" kind="light" onPress={() => void addPhoto('library')} disabled={photos.length >= 5} />
                  </View>
                  {photos.length === 0 ? <Text style={styles.helperText}>Add up to five photos of the affected stalks, leaves, or field area.</Text> : null}
                </Card>
                <Card>
                  <Text style={styles.cardTitle}>Report sharing</Text>
                  <PrivacyNote text="Submitting sends this report and its photos to authorized SRA staff for review. This happens automatically. You can choose separately whether to share an anonymized observation with other farmers below." />
                  <ToggleLine
                    title="Share an anonymized observation with the farmer community"
                    description="Optional. Other farmers can see this report and its attached photos. Your name, farm name, barangay, and exact location stay private."
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
        if (selectedReport) {
          return (
            <>
              <PageIntro eyebrow="REPORT DETAILS" title={selectedReport.code} subtitle={`${selectedReport.property_name} · ${selectedReport.municipality}, ${selectedReport.province}`} action={<TouchableOpacity onPress={() => setSelectedReport(null)}><Text style={styles.linkText}>Back to reports</Text></TouchableOpacity>} />
              <Card>
                <View style={styles.detailStatus}><Text style={styles.cardTitle}>SRA status</Text><Pill text={selectedReport.verification_status} tone={selectedReport.verification_status === 'Confirmed' ? 'green' : selectedReport.verification_status === 'No detection' ? 'gray' : 'amber'} /></View>
                <InfoRow label="Observed" value={selectedReport.observed_at} />
                <InfoRow label="Submitted" value={selectedReport.submitted_at} />
                <View style={styles.infoRow}><Text style={styles.infoLabel}>Farmer severity</Text><SeverityBadge severity={selectedReport.farmer_severity} range={selectedReport.farmer_severity_range} /></View>
                <Text style={styles.helperText}>Farmer-estimated crop damage; SRA verification is recorded separately.</Text>
                <InfoRow label="SRA severity" value={selectedReport.sra_severity || 'Not assessed'} translateValue />
                <InfoRow label="Affected area" value={`${selectedReport.affected_area_hectares || '0'} ha`} />
                <Text style={styles.inputLabel}>Observation</Text><NativeText style={styles.bodyText}>{selectedReport.observations}</NativeText>
                <Text style={[styles.inputLabel, styles.detailLabel]}>Damage description</Text><NativeText style={styles.bodyText}>{selectedReport.damage_description}</NativeText>
              </Card>
              {selectedReport.photos.length > 0 ? <Card><Text style={styles.cardTitle}>Attached photos</Text>{selectedReport.photos.map(photo => <Text key={photo.id} style={styles.photoName}>{photo.name}</Text>)}</Card> : null}
              <PrivacyNote text="A farmer report is an observation for SRA review. The farmer's estimate is not an SRA diagnosis." />
            </>
          );
        }
        return (
          <>
            <PageIntro eyebrow="REPORT HISTORY" title="My submitted reports" subtitle="Filter your observations, view their review status, or export a CSV summary." action={<TouchableOpacity onPress={() => void props.onRefresh()} disabled={!networkConnected}><Text style={[styles.linkText, !networkConnected && styles.disabledText]}>Refresh</Text></TouchableOpacity>} />
            <View style={styles.filterChipRow}>
              {['All', 'Pending', 'Reviewed', 'Severe'].map(value => (
                <TouchableOpacity key={value} style={[styles.filterChip, historyFilter === value && styles.filterChipActive]} onPress={() => setHistoryFilter(value)}>
                  <Text style={[styles.filterChipText, historyFilter === value && styles.filterChipTextActive]}>{value}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Card>
              <View style={styles.cardTitleRow}><Text style={styles.cardTitle}>Active filters</Text><Text style={styles.sectionHint}>{historyFilter === 'All' ? 'All statuses' : historyFilter}</Text></View>
              <Text style={styles.cardSub}>{historyFilter === 'Pending' ? 'Reports awaiting SRA review.' : historyFilter === 'Reviewed' ? 'Reports with a recorded SRA review.' : historyFilter === 'Severe' ? 'Reports you marked severe or highly severe.' : 'All reports from your account.'}</Text>
              <View style={styles.buttonRow}><View style={styles.flex}><Button label="Change filters" kind="blue" onPress={() => setHistoryFilter('All')} /></View><View style={styles.flex}><Button label="Export CSV" kind="light" onPress={() => void exportReports()} /></View></View>
            </Card>
            <TextInput value={reportSearch} onChangeText={setReportSearch} placeholder={t('Search reports, farms, or municipalities')} placeholderTextColor="#98A5B8" style={styles.input} accessibilityLabel={t('Search reports')} returnKeyType="search" />
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
              ) : filteredReports.length === 0 ? <EmptyState icon="⌕" title="No reports match these filters" description="Change the status filter or search for another report." /> : filteredReports.map(report => <ReportRow key={report.id} report={report} onPress={() => setSelectedReport(report)} />)}
            </Card>
            <Button label="Export CSV" kind="blue" onPress={() => void exportReports()} />
            <PrivacyNote text="Report status and severity are separate. A farmer’s estimate is not an SRA diagnosis." />
          </>
        );
      case 'community':
        return (
          <>
            <PageIntro eyebrow="SRA FARMER NETWORK" title="Field updates" subtitle="Community observations are shared only with the farmer’s consent and exclude personal details." />
            <View style={styles.filterChipRow}>
              <TouchableOpacity style={[styles.filterChip, styles.filterChipActive]}><Text style={[styles.filterChipText, styles.filterChipTextActive]}>Field updates</Text></TouchableOpacity>
              <TouchableOpacity style={styles.filterChip} onPress={() => setTab('history')}><Text style={styles.filterChipText}>My reports</Text></TouchableOpacity>
              <TouchableOpacity style={styles.filterChip} onPress={() => setTab('farms')}><Text style={styles.filterChipText}>My farm</Text></TouchableOpacity>
            </View>
            {!networkConnected ? (
              <Card><EmptyState icon="⌁" title="Updates need internet" description="Community posts and confirmations are online-only. Your own farms and saved reports still work offline." /></Card>
            ) : (
              <Card>
                <View style={styles.cardTitleRow}><Text style={styles.cardTitle}>Shared observations</Text><TouchableOpacity onPress={() => void props.onLoadCommunity()}><Text style={styles.linkText}>Reload</Text></TouchableOpacity></View>
                <Text style={styles.cardSub}>Only posts that farmers chose to share appear here. Identity and exact farm details are removed.</Text>
                {community.length === 0 ? (
                  <EmptyState icon="◎" title="No shared updates yet" description="When a farmer opts in to share an observation, it will appear here." />
                ) : community.map(item => (
                  <CommunityCard key={item.id} item={item} token={props.token} onConfirm={() => void props.onCommunityConfirmed(item.id)} disabled={!networkConnected || item.confirmed_by_me} />
                ))}
              </Card>
            )}
            <PrivacyNote text="A community response is not a pest confirmation. Only authorized SRA staff can verify a report." />
          </>
        );
      case 'profile':
        return (
          <>
            <PageIntro eyebrow="ACCOUNT & PRIVACY" title="My profile" subtitle="Update your account information and default farm details." />
            <Card>
              <Text style={styles.cardTitle}>Personal information</Text>
              <View style={[styles.profileHeader, styles.profileHeaderSpaced]}><Avatar name={user.name} photoUrl={user.profile_photo_url} photoCacheKey={user.profile_photo_cache_key} token={token} /><View style={styles.flex}><Text style={styles.profileName}>{user.name}</Text><Text style={styles.cardSub}>{user.email}</Text></View></View>
              {profileEditing ? <>
                <Field label="Full name" value={profileName} onChangeText={setProfileName} placeholder="Your name" autoCapitalize="words" />
                <ProfilePhotoPicker name={profileName || user.name} photoUrl={user.profile_photo_url} photoCacheKey={user.profile_photo_cache_key} token={token} selectedPhoto={profilePhoto} onSelect={setProfilePhoto} disabled={profileBusy} />
                <Text style={styles.readOnlyFieldLabel}>Email address</Text><Text style={styles.readOnlyField}>{user.email}</Text>
                <Text style={styles.helperText}>Email changes are managed by your SRA administrator.</Text>
                <View style={styles.buttonRow}><Button label="Cancel" kind="light" onPress={() => {setProfileEditing(false); setProfileName(user.name); setProfilePhoto(null); setProfileMessage('');}} /><Button label={profileBusy ? 'Saving…' : 'Save changes'} onPress={() => void saveProfileName()} disabled={profileBusy} loading={profileBusy} /></View>
              </> : <Button label="Edit profile" kind="light" onPress={() => {setProfileMessage(''); setProfilePhoto(null); setProfileEditing(true);}} />}
              {profileMessage ? <Notice text={profileMessage} tone={profileMessage.includes('updated') ? 'success' : 'error'} /> : null}
              <InfoRow label="Farmer reference" value={user.reference} />
              <InfoRow label="Phone number" value={user.phone_number || 'Not provided'} />
              <InfoRow label="Account status" value={user.status} translateValue />
            </Card>
            <Card>
              <Text style={styles.cardTitle}>App settings</Text>
              <ThemeSwitcher />
              <LanguageSwitcher />
            </Card>
            <Card>
              <View style={styles.cardTitleRow}><Text style={styles.cardTitle}>Default farm / report address</Text><TouchableOpacity onPress={() => setTab('farms')}><Text style={styles.linkText}>Edit farms</Text></TouchableOpacity></View>
              {selectedProperty ? <>
                <InfoRow label="Farm / plot" value={selectedProperty.name} />
                <InfoRow label="Province" value={selectedProperty.province} />
                <InfoRow label="Municipality / city" value={selectedProperty.municipality} />
                <InfoRow label="Barangay" value={selectedProperty.barangay || 'Not provided'} />
                <InfoRow label="Complete farm address" value={selectedProperty.address || 'Not provided'} />
                <View style={styles.profileLocationNote}><Text style={styles.profileLocationIcon}>⌖</Text><Text style={styles.profileLocationText}>This farm is selected for your next field report. You can choose another farm before submitting.</Text></View>
              </> : <EmptyState icon="⌖" title="No default farm yet" description="Add a farm so it can be used as the default address for new reports." />}
              <Button label={properties.length ? 'Choose default farm' : 'Add a farm'} kind="light" onPress={() => setTab('farms')} />
            </Card>
            <Card>
              <Text style={styles.cardTitle}>Data stored for offline use</Text>
              <Text style={styles.bodyText}>Your account session, saved farm details, last report list and unsent reports are stored in your device’s protected credential store. Unsent items sync when RSSI is reachable.</Text>
              <Text style={[styles.bodyText, styles.bodyTextSpaced]}>Community updates are not cached and cannot be opened offline.</Text>
            </Card>
            {notice ? <Notice text={notice} tone="info" /> : null}
            <Button label="Help & support" kind="light" onPress={() => setTab('support')} />
            <Button label="Sign out" kind="danger" onPress={() => void props.onSignOut()} />
          </>
        );
      case 'support':
        return (
          <>
            <PageIntro eyebrow="HELP CENTER" title="Help & support" subtitle="Quick help for common RSSI farmer app tasks." action={<TouchableOpacity onPress={() => setTab('profile')}><Text style={styles.linkText}>My account</Text></TouchableOpacity>} />
            <Card><Text style={styles.cardTitle}>Can't sign in?</Text><Text style={styles.bodyText}>Check the email and password you registered with, confirm your device is online, and try again. Contact your SRA administrator if you still cannot sign in.</Text></Card>
            <Card><Text style={styles.cardTitle}>Server unavailable or offline?</Text><Text style={styles.bodyText}>Saved farms and reports remain on this device. Reports waiting to sync are submitted automatically after the server is reachable; you can also retry from My reports.</Text></Card>
            <Card><Text style={styles.cardTitle}>Location and privacy</Text><Text style={styles.bodyText}>A precise farm pin is optional and saved only after you grant location permission. Community posts are shared only when you opt in, and never include your name, farm name, exact location, or photos.</Text></Card>
            <Card><Text style={styles.cardTitle}>Need help from SRA?</Text><Text style={styles.bodyText}>Contact your SRA administrator through your organization's established support channel and include your farmer reference: {user.reference}.</Text></Card>
            <PrivacyNote text="Community confirmations reflect farmer agreement. Only authorized SRA staff can verify an observation." />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.appRoot} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.appHeader}>
        <View style={styles.headerBrand}><BrandMark /><View style={styles.headerBrandCopy}><Text style={styles.headerBrandName} numberOfLines={1}>{screenTitle}</Text><Text style={styles.headerBrandSub} numberOfLines={1}>RSSI · Negros Oriental & Negros Occidental</Text></View></View>
        <TouchableOpacity style={styles.headerAccount} onPress={() => setTab('profile')}>
          <View style={[styles.headerOnlineDot, networkConnected && serverReachable ? styles.onlineDot : styles.offlineDot]} />
          <NativeText style={styles.headerAccountText} numberOfLines={1}>{user.name.split(' ')[0]}</NativeText>
          <Avatar name={user.name} photoUrl={user.profile_photo_url} photoCacheKey={user.profile_photo_cache_key} token={token} size={31} />
        </TouchableOpacity>
      </View>
      <View style={styles.monitoringBanner}><Text style={styles.monitoringBannerText}>RSSI MONITORING · Farmer observations are subject to SRA review</Text></View>
      {!networkConnected ? (
        <View style={styles.offlineBanner}><Text style={styles.offlineIcon}>⌁</Text><Text style={styles.offlineBannerText}>Offline mode · saved reports will sync automatically</Text></View>
      ) : networkConnected && !serverReachable ? (
        <View style={[styles.offlineBanner, styles.serverBanner]}><Text style={styles.offlineIcon}>↻</Text><Text style={styles.offlineBannerText}>Network available · reconnecting to RSSI server</Text></View>
      ) : null}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {notice ? (
        <TouchableOpacity style={styles.noticeWrap} onPress={clearNotice}><Notice text={notice} tone="info" /><Text style={styles.dismissText}>Tap to dismiss</Text></TouchableOpacity>
      ) : null}
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.screenContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        scrollEnabled={!farmMapGestureActive}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshData} />}
      >
        {renderCurrentScreen()}
        <View style={styles.bottomSpacer} />
      </ScrollView>
      <View style={styles.bottomNav}>
        <NavButton icon="⌂" label="Home" active={tab === 'home'} onPress={() => setTab('home')} />
        <NavButton icon="⌖" label="Farms" active={tab === 'farms'} onPress={() => setTab('farms')} />
        <TouchableOpacity style={styles.primaryNavAction} onPress={() => setTab('report')} accessibilityRole="button" accessibilityLabel="New report">
          <Text style={styles.primaryNavPlus}>＋</Text><Text style={styles.primaryNavLabel}>Report</Text>
        </TouchableOpacity>
        <NavButton icon="◷" label="History" active={tab === 'history'} onPress={() => setTab('history')} badge={queue.length} />
        <NavButton icon="◎" label="Updates" active={tab === 'community'} onPress={() => setTab('community')} />
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function localDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
