import React, {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Image, Platform, ScrollView, Share, Text, TextInput, TouchableOpacity, View} from 'react-native';
import RNFS from 'react-native-fs';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import {WebView} from 'react-native-webview';
import {SafeAreaView} from 'react-native-safe-area-context';
import {apiRequest, CommunityUpdate, FarmProperty, Farmer, FieldReport, getApiBaseUrl} from '../api';
import {captureFarmCoordinates, FarmCoordinates} from '../location';
import {createId, QueuedPhoto, QueuedReport, storePhoto} from '../reportQueue';
import {C, styles} from '../theme';
import {Tab} from '../types';
import {Avatar, BrandMark, Button, Card, Choice, CommunityCard, EmptyState, FarmRow, Field, InfoRow, NavButton, Notice, PageIntro, Pill, PrivacyNote, QueuedReportRow, ReportRow, SummaryCard, ToggleLine} from '../components/UI';

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
  onChangeServer: () => Promise<void>;
  onUpdateFarmerName: (name: string) => Promise<void>;
  onCommunityConfirmed: (id: number) => Promise<void>;
}) {
  const {
    user, properties, reports, queue, community, tab, setTab,
    hasInternet, networkConnected, serverReachable, busy, notice, clearNotice, onMessage, token,
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
  const [severity, setSeverity] = useState('Mild');
  const [area, setArea] = useState('');
  const [locationDescription, setLocationDescription] = useState('');
  const [useFarmAddress, setUseFarmAddress] = useState(true);
  const [reportConsent, setReportConsent] = useState(false);
  const [communityShare, setCommunityShare] = useState(false);
  const [photos, setPhotos] = useState<QueuedPhoto[]>([]);
  const [reportError, setReportError] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [reportSearch, setReportSearch] = useState('');
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [mapSearch, setMapSearch] = useState('');
  const [mapProvinceFilter, setMapProvinceFilter] = useState('All provinces');
  const [mapSeverityFilter, setMapSeverityFilter] = useState('All severity');
  const [historyFilter, setHistoryFilter] = useState('All');
  const [selectedMapReportId, setSelectedMapReportId] = useState<number | null>(null);
  const [selectedReport, setSelectedReport] = useState<FieldReport | null>(null);
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileName, setProfileName] = useState(user.name);
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
  const totalReports = reports.length;
  const localTotal = totalReports + queue.filter(item => !item.serverReportId).length;
  const dashboardStatus = networkConnected ? (serverReachable ? 'Connected' : 'Server checking') : 'Offline mode';
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
      await props.onUpdateFarmerName(trimmed);
      setProfileEditing(false);
      setProfileMessage('Your profile was updated.');
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : 'Could not update your profile.');
    } finally {
      setProfileBusy(false);
    }
  };

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

  const visibleMapProperties = properties.filter(property => {
    const query = mapSearch.trim().toLocaleLowerCase();
    const matchesQuery = !query || [property.name, property.province, property.municipality, property.barangay || '']
      .some(value => value.toLocaleLowerCase().includes(query));
    const matchesProvince = mapProvinceFilter === 'All provinces' || property.province === mapProvinceFilter;
    return matchesQuery && matchesProvince;
  });
  const visibleMapReports = reports.filter(report => {
    const query = mapSearch.trim().toLocaleLowerCase();
    const matchesQuery = !query || [report.code, report.property_name, report.province, report.municipality, report.observations]
      .some(value => value.toLocaleLowerCase().includes(query));
    const matchesProvince = mapProvinceFilter === 'All provinces' || report.province === mapProvinceFilter;
    const severity = report.farmer_severity.toLocaleLowerCase();
    const matchesSeverity = mapSeverityFilter === 'All severity'
      || (mapSeverityFilter === 'Mild' && ['mild', 'low'].includes(severity))
      || (mapSeverityFilter !== 'All severity' && mapSeverityFilter !== 'Mild' && severity === mapSeverityFilter.toLocaleLowerCase());
    return matchesQuery && matchesProvince && matchesSeverity;
  });
  const farmsByProvince = properties.reduce<Record<string, number>>((counts, property) => {
    counts[property.province] = (counts[property.province] || 0) + 1;
    return counts;
  }, {});
  const dashboardMatches = dashboardSearch.trim()
    ? {
      farms: properties.filter(property => `${property.name} ${property.province} ${property.municipality} ${property.barangay || ''}`.toLocaleLowerCase().includes(dashboardSearch.trim().toLocaleLowerCase())),
      reports: reports.filter(report => `${report.code} ${report.property_name} ${report.province} ${report.municipality} ${report.observations}`.toLocaleLowerCase().includes(dashboardSearch.trim().toLocaleLowerCase())),
    }
    : null;
  const mapHtml = useMemo(() => createMapHtml(visibleMapProperties), [visibleMapProperties]);
  const screenTitle = tab === 'home' ? 'Dashboard'
    : tab === 'map' ? 'Map coverage'
      : tab === 'report' ? 'Submit report'
        : tab === 'history' ? 'My submitted reports'
          : tab === 'community' ? 'Updates'
            : tab === 'farms' ? 'My farm'
              : tab === 'profile' ? 'My profile' : 'Help & support';

  const renderCurrentScreen = () => {
    switch (tab) {
      case 'home':
        return (
          <>
            <PageIntro eyebrow="RSSI FARMER MONITORING" title="Dashboard" subtitle={`Welcome back, ${user.name.split(' ')[0]}. Track your farms and field observations.`} />
            <TextInput
              value={dashboardSearch}
              onChangeText={setDashboardSearch}
              placeholder="Search farms, barangays, or reports…"
              placeholderTextColor="#7D91A2"
              style={styles.dashboardSearch}
              accessibilityLabel="Search farms and reports"
              returnKeyType="search"
            />
            {dashboardMatches ? (
              <Card>
                <View style={styles.cardTitleRow}><Text style={styles.cardTitle}>Search results</Text><TouchableOpacity onPress={() => setDashboardSearch('')}><Text style={styles.linkText}>Clear</Text></TouchableOpacity></View>
                {dashboardMatches.farms.map(property => <FarmRow key={`search-farm-${property.id}`} property={property} onPress={() => {setSelectedFarm(property.id); setTab('farms');}} selected={false} />)}
                {dashboardMatches.reports.map(report => <ReportRow key={`search-report-${report.id}`} report={report} onPress={() => {setSelectedReport(report); setTab('history');}} />)}
                {dashboardMatches.farms.length + dashboardMatches.reports.length === 0 ? <EmptyState icon="⌕" title="No matches" description="Try a farm name, municipality, or report code." /> : null}
              </Card>
            ) : null}
            <View style={styles.summaryGrid}>
              <SummaryCard label="Coverage" value={`${new Set(properties.map(property => property.province)).size} provinces`} icon="⌖" tone="blue" />
              <SummaryCard label="Active reports" value={String(localTotal)} icon="▤" tone="green" />
              <SummaryCard label="Last sync" value={serverReachable ? 'Live' : 'Offline'} icon="↻" tone={serverReachable ? 'green' : 'amber'} />
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
            <TouchableOpacity style={styles.profileShortcut} onPress={() => setTab('profile')} accessibilityRole="button">
              <View style={styles.profileShortcutIcon}><Avatar name={user.name} /></View>
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
            <View style={styles.buttonRow}>
              <View style={styles.flex}><Button label="Export summary" kind="blue" onPress={() => void exportReports()} /></View>
              <View style={styles.flex}><Button label="Add field report" onPress={() => setTab('report')} /></View>
            </View>
            <View style={styles.buttonRow}>
              <View style={styles.flex}><Button label="View map" kind="light" onPress={() => setTab('map')} /></View>
              <View style={styles.flex}><Button label="View reports" kind="light" onPress={() => setTab('history')} /></View>
            </View>
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
            <PageIntro eyebrow="NEGROS ORIENTAL & OCCIDENTAL" title="Map coverage" subtitle="Explore your farm records and report coverage across the Negros provinces." />
            <TextInput value={mapSearch} onChangeText={setMapSearch} placeholder="Search city, farm, or report…" placeholderTextColor="#7D91A2" style={styles.dashboardSearch} accessibilityLabel="Search map coverage" />
            <View style={styles.filterChipRow}>
              {['All provinces', 'Negros Oriental', 'Negros Occidental'].map(value => (
                <TouchableOpacity key={value} style={[styles.filterChip, mapProvinceFilter === value && styles.filterChipActive]} onPress={() => setMapProvinceFilter(value)}>
                  <Text style={[styles.filterChipText, mapProvinceFilter === value && styles.filterChipTextActive]}>{value === 'All provinces' ? 'Both provinces' : value.replace('Negros ', '')}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.filterChipRow}>
              {['All severity', 'Mild', 'Moderate', 'Severe', 'Highly severe'].map(value => (
                <TouchableOpacity key={value} style={[styles.filterChip, mapSeverityFilter === value && styles.filterChipActive]} onPress={() => setMapSeverityFilter(value)}>
                  <Text style={[styles.filterChipText, mapSeverityFilter === value && styles.filterChipTextActive]}>{value}</Text>
                </TouchableOpacity>
              ))}
            </View>
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
            ) : visibleMapProperties.length === 0 ? <Card><EmptyState icon="⌕" title="No farms match your search" description="Try a different farm name, province, or municipality." /></Card> : visibleMapProperties.map(property => <FarmRow key={property.id} property={property} onPress={() => {setSelectedFarm(property.id); setTab('farms');}} selected={false} />)}
            <Card>
              <View style={styles.cardTitleRow}><Text style={styles.cardTitle}>Coverage overview</Text><Pill text={`${visibleMapReports.length} reports`} tone="blue" /></View>
              <Text style={styles.cardSub}>Counts show only records linked to your account.</Text>
              {visibleMapReports.length === 0 ? <EmptyState icon="⌖" title="No report areas yet" description="Municipalities from your submitted reports will appear here." /> : Object.entries(visibleMapReports.reduce<Record<string, number>>((counts, report) => {
                const areaName = `${report.municipality}, ${report.province}`;
                counts[areaName] = (counts[areaName] || 0) + 1;
                return counts;
              }, {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([areaName, count]) => (
                <View key={areaName} style={styles.coverageRow}><Text style={styles.coverageArea}>{areaName}</Text><Pill text={String(count)} tone="blue" /></View>
              ))}
            </Card>
            <Card>
              <View style={styles.cardTitleRow}><Text style={styles.cardTitle}>Selected report</Text><TouchableOpacity onPress={() => setTab('history')}><Text style={styles.linkText}>View reports</Text></TouchableOpacity></View>
              {visibleMapReports.length === 0 ? <EmptyState icon="⌖" title="No reports match these filters" description="Change the province or severity filter to see more of your records." /> : visibleMapReports.slice(0, 5).map(report => (
                <ReportRow key={report.id} report={report} onPress={() => setSelectedMapReportId(report.id)} />
              ))}
              {selectedMapReportId !== null && reports.some(report => report.id === selectedMapReportId) ? <Button label="Open report details" kind="blue" onPress={() => {setSelectedReport(reports.find(report => report.id === selectedMapReportId) || null); setTab('history');}} /> : null}
              <Button label="Add field report" onPress={() => setTab('report')} />
            </Card>
            <Text style={styles.mapAttribution}>Map data © OpenStreetMap contributors</Text>
            <PrivacyNote text="Other farmers’ exact locations are not shown. Reports are observations pending SRA review." />
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
                        <Text style={styles.propertyOptionTitle}>{property.name}</Text>
                        <Text style={styles.propertyOptionSub}>{property.municipality} · {property.province}</Text>
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
        if (selectedReport) {
          return (
            <>
              <PageIntro eyebrow="REPORT DETAILS" title={selectedReport.code} subtitle={`${selectedReport.property_name} · ${selectedReport.municipality}, ${selectedReport.province}`} action={<TouchableOpacity onPress={() => setSelectedReport(null)}><Text style={styles.linkText}>Back to reports</Text></TouchableOpacity>} />
              <Card>
                <View style={styles.detailStatus}><Text style={styles.cardTitle}>SRA status</Text><Pill text={selectedReport.verification_status} tone={selectedReport.verification_status === 'Confirmed' ? 'green' : selectedReport.verification_status === 'No detection' ? 'gray' : 'amber'} /></View>
                <InfoRow label="Observed" value={selectedReport.observed_at} />
                <InfoRow label="Submitted" value={selectedReport.submitted_at} />
                <InfoRow label="Farmer severity" value={selectedReport.farmer_severity} />
                <InfoRow label="SRA severity" value={selectedReport.sra_severity || 'Not assessed'} />
                <InfoRow label="Affected area" value={`${selectedReport.affected_area_hectares || '0'} ha`} />
                <Text style={styles.inputLabel}>Observation</Text><Text style={styles.bodyText}>{selectedReport.observations}</Text>
                <Text style={[styles.inputLabel, styles.detailLabel]}>Damage description</Text><Text style={styles.bodyText}>{selectedReport.damage_description}</Text>
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
            <TextInput value={reportSearch} onChangeText={setReportSearch} placeholder="Search reports, farms, or municipalities" placeholderTextColor="#98A5B8" style={styles.input} accessibilityLabel="Search reports" returnKeyType="search" />
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
            <PageIntro eyebrow="ACCOUNT & PRIVACY" title="My profile" subtitle="Update your account information and default farm details." />
            <Card>
              <Text style={styles.cardTitle}>Personal information</Text>
              <View style={[styles.profileHeader, {marginTop: 12}]}><Avatar name={user.name} /><View style={styles.flex}><Text style={styles.profileName}>{user.name}</Text><Text style={styles.cardSub}>{user.email}</Text></View></View>
              {profileEditing ? <>
                <Field label="Full name" value={profileName} onChangeText={setProfileName} placeholder="Your name" autoCapitalize="words" />
                <Text style={styles.readOnlyFieldLabel}>Email address</Text><Text style={styles.readOnlyField}>{user.email}</Text>
                <Text style={styles.helperText}>Email changes are managed by your SRA administrator.</Text>
                <View style={styles.buttonRow}><Button label="Cancel" kind="light" onPress={() => {setProfileEditing(false); setProfileName(user.name); setProfileMessage('');}} /><Button label={profileBusy ? 'Saving…' : 'Save changes'} onPress={() => void saveProfileName()} disabled={profileBusy} loading={profileBusy} /></View>
              </> : <Button label="Edit profile" kind="light" onPress={() => {setProfileMessage(''); setProfileEditing(true);}} />}
              {profileMessage ? <Notice text={profileMessage} tone={profileMessage.includes('updated') ? 'success' : 'error'} /> : null}
              <InfoRow label="Farmer reference" value={user.reference} />
              <InfoRow label="Account status" value={user.status} />
              <InfoRow label="API server" value={getApiBaseUrl()} compact />
              <Text style={styles.helperText}>For production phones, configure this app to use your organization’s HTTPS RSSI server.</Text>
            </Card>
            <Card>
              <View style={styles.cardTitleRow}><Text style={styles.cardTitle}>Default farm / report address</Text><TouchableOpacity onPress={() => setTab('farms')}><Text style={styles.linkText}>Edit farms</Text></TouchableOpacity></View>
              {selectedProperty ? <>
                <InfoRow label="Farm / plot" value={selectedProperty.name} />
                <InfoRow label="Province" value={selectedProperty.province} />
                <InfoRow label="Municipality / city" value={selectedProperty.municipality} />
                <InfoRow label="Barangay" value={selectedProperty.barangay || 'Not provided'} />
                <View style={styles.profileLocationNote}><Text style={styles.profileLocationIcon}>⌖</Text><Text style={styles.profileLocationText}>This farm is selected for your next field report. You can choose another farm before submitting.</Text></View>
              </> : <EmptyState icon="⌖" title="No default farm yet" description="Add a farm so it can be used as the default address for new reports." />}
              <Button label={properties.length ? 'Choose default farm' : 'Add a farm'} kind="light" onPress={() => setTab('farms')} />
            </Card>
            <Card>
              <Text style={styles.cardTitle}>Data stored for offline use</Text>
              <Text style={styles.bodyText}>Your account session, saved farm details, last report list and unsent reports are stored in your device’s protected credential store. Unsent items sync when RSSI is reachable.</Text>
              <Text style={[styles.bodyText, {marginTop: 12}]}>Community updates are not cached and cannot be opened offline.</Text>
            </Card>
            {notice ? <Notice text={notice} tone="info" /> : null}
            <Button label="Change server address" kind="light" onPress={() => props.onChangeServer().catch(() => undefined)} />
            <Button label="Help & support" kind="light" onPress={() => setTab('support')} />
            <Button label="Sign out" kind="danger" onPress={() => void props.onSignOut()} />
          </>
        );
      case 'support':
        return (
          <>
            <PageIntro eyebrow="HELP CENTER" title="Help & support" subtitle="Quick help for common RSSI farmer app tasks." action={<TouchableOpacity onPress={() => setTab('profile')}><Text style={styles.linkText}>My account</Text></TouchableOpacity>} />
            <Card><Text style={styles.cardTitle}>Can't sign in?</Text><Text style={styles.bodyText}>Check the email and password you registered with. Confirm the RSSI server address on the sign-in screen matches your organization's server, then try again while connected to its network.</Text></Card>
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
    <SafeAreaView style={styles.appRoot} edges={['top', 'left', 'right']}>
      <View style={styles.appHeader}>
        <View style={styles.headerBrand}><BrandMark /><View style={styles.headerBrandCopy}><Text style={styles.headerBrandName} numberOfLines={1}>{screenTitle}</Text><Text style={styles.headerBrandSub} numberOfLines={1}>RSSI · Negros Oriental & Negros Occidental</Text></View></View>
        <TouchableOpacity style={styles.headerAccount} onPress={() => setTab('profile')}>
          <View style={[styles.headerOnlineDot, {backgroundColor: networkConnected && serverReachable ? C.green : C.amber}]} />
          <Text style={styles.headerAccountText} numberOfLines={1}>{user.name.split(' ')[0]}</Text>
          <Text style={styles.headerAvatar}>{user.name.trim().charAt(0).toUpperCase()}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.monitoringBanner}><Text style={styles.monitoringBannerText}>RSSI MONITORING · Farmer observations are subject to SRA review</Text></View>
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
        <NavButton icon="⌖" label="Map" active={tab === 'map'} onPress={() => setTab('map')} />
        <TouchableOpacity style={styles.primaryNavAction} onPress={() => setTab('report')} accessibilityRole="button" accessibilityLabel="New report">
          <Text style={styles.primaryNavPlus}>＋</Text><Text style={styles.primaryNavLabel}>Report</Text>
        </TouchableOpacity>
        <NavButton icon="◷" label="History" active={tab === 'history'} onPress={() => setTab('history')} badge={queue.length} />
        <NavButton icon="◎" label="Updates" active={tab === 'community'} onPress={() => setTab('community')} />
      </View>
    </SafeAreaView>
  );
}

function createMapHtml(properties: FarmProperty[]): string {
  const markers = properties.filter(property => property.latitude !== null && property.longitude !== null && property.location_consent).map(property => [property.latitude, property.longitude]);
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>html,body,#map{height:100%;margin:0;background:#eaf0ea}.leaflet-control-attribution{font-size:9px!important}</style></head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>const map=L.map('map').setView([9.58,122.95],8);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);const farms=${JSON.stringify(markers)};farms.forEach(([lat,lng])=>L.circleMarker([lat,lng],{radius:8,color:'#ffffff',weight:3,fillColor:'#16834a',fillOpacity:1}).addTo(map).bindPopup('Your farm'));if(farms.length){map.fitBounds(L.latLngBounds(farms).pad(0.35),{maxZoom:11})}</script></body></html>`;
}

function localDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
