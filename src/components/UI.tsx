import React, {useRef, useState} from 'react';
import {ActivityIndicator, Image, Modal, PanResponder, Switch, Text as NativeText, TextInput, TouchableOpacity, View, useWindowDimensions} from 'react-native';
import {Asset, launchImageLibrary} from 'react-native-image-picker';
import {SafeAreaView} from 'react-native-safe-area-context';
import {CommunityUpdate, FarmProperty, FieldReport, getProfilePhotoUri} from '../api';
import {farmLocationSourceLabel} from '../location';
import {Language, LocalizedText as Text, useLanguage} from '../i18n';
import {PhotoUploadProgress, QueuedReport} from '../reportQueue';
import {C, styles, ThemeMode, useTheme} from '../theme';
import {
  avatarInitialStyle,
  avatarSizeStyle,
  backgroundStyle,
  severityBadgeStyle,
  textColorStyle,
} from '../../assets/styles/dynamicStyles';

export function LoadingScreen() {
  return <SafeAreaView style={styles.loadingRoot}><BrandMark large /><ActivityIndicator color={C.blue} size="large" style={styles.loadingSpinner} /><Text style={styles.loadingText}>Opening your RSSI workspace…</Text></SafeAreaView>;
}

export function BrandMark({large = false}: {large?: boolean}) {
  const {t} = useLanguage();
  return <Image source={require('../../assets/rssi-logo.png')} resizeMode="contain" style={[styles.brandMark, large && styles.brandMarkLarge]} accessibilityLabel={t('RSSI logo')} />;
}

export function PageIntro({eyebrow, title, subtitle, action}: {eyebrow: string; title: string; subtitle: string; action?: React.ReactNode}) {
  const {t} = useLanguage();
  return <View style={styles.pageIntro}>
    <View style={styles.pageIntroRow}><View style={styles.flex}><Text style={styles.pageEyebrow}>{t(eyebrow)}</Text><Text style={styles.pageTitle}>{t(title)}</Text></View>{action}</View>
    <Text style={styles.pageSub}>{t(subtitle)}</Text>
  </View>;
}

export function Card({children, style}: {children: React.ReactNode; style?: object}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Field(props: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  showPasswordToggle?: boolean;
  keyboardType?: 'default' | 'email-address' | 'decimal-pad' | 'numeric' | 'url';
  multiline?: boolean;
  maxLength?: number;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  onBlur?: () => void;
}) {
  const {t} = useLanguage();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const canTogglePassword = Boolean(props.secureTextEntry && props.showPasswordToggle);
  return <View style={styles.fieldWrap}>
    <Text style={styles.inputLabel}>{t(props.label)}</Text>
    <View style={{position: 'relative', justifyContent: 'center'}}>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        onBlur={props.onBlur}
        placeholder={props.placeholder ? t(props.placeholder) : undefined}
        placeholderTextColor="#98A5B8"
        secureTextEntry={props.secureTextEntry && !passwordVisible}
        keyboardType={props.keyboardType || 'default'}
        multiline={props.multiline}
        maxLength={props.maxLength}
        autoCapitalize={props.autoCapitalize || 'sentences'}
        autoCorrect={props.autoCorrect ?? (!props.secureTextEntry && props.keyboardType !== 'email-address')}
        style={[styles.input, props.multiline && styles.multilineInput, canTogglePassword && {paddingRight: 52}]}
        textAlignVertical={props.multiline ? 'top' : 'center'}
      />
      {canTogglePassword ? <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
        accessibilityState={{selected: passwordVisible}}
        onPress={() => setPasswordVisible(visible => !visible)}
        style={{position: 'absolute', right: 12, height: 44, minWidth: 32, alignItems: 'center', justifyContent: 'center'}}
        hitSlop={8}
      >
        <View style={{width: 20, height: 14, borderWidth: 1.7, borderColor: '#667B8C', borderRadius: 10, alignItems: 'center', justifyContent: 'center'}}>
          <View style={{width: 5, height: 5, borderRadius: 3, backgroundColor: '#667B8C'}} />
          {!passwordVisible ? <View style={{position: 'absolute', width: 23, height: 1.7, backgroundColor: '#667B8C', transform: [{rotate: '-42deg'}]}} /> : null}
        </View>
      </TouchableOpacity> : null}
    </View>
  </View>;
}

export function Button({label, onPress, disabled = false, loading = false, kind = 'primary'}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  kind?: 'primary' | 'light' | 'danger' | 'blue';
}) {
  return <TouchableOpacity
    style={[styles.button, kind === 'light' && styles.buttonLight, kind === 'danger' && styles.buttonDanger, kind === 'blue' && styles.buttonBlue, disabled && styles.buttonDisabled]}
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
  >
    {loading ? <ActivityIndicator size="small" color={kind === 'light' || kind === 'danger' ? C.blue : C.paper} style={styles.buttonSpinner} /> : null}
    <Text style={[styles.buttonText, kind === 'light' && styles.buttonLightText, kind === 'danger' && styles.buttonDangerText]}>{label}</Text>
  </TouchableOpacity>;
}

export function Choice({label, active, onPress, compact = false}: {label: string; active: boolean; onPress: () => void; compact?: boolean}) {
  return <TouchableOpacity onPress={onPress} style={[styles.choice, active && styles.choiceActive, compact && styles.choiceCompact]}>
    <View style={[styles.radio, active && styles.radioActive]}>{active ? <View style={styles.radioInner} /> : null}</View>
    <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
  </TouchableOpacity>;
}

export function ToggleLine({title, description, value, onValueChange}: {title: string; description: string; value: boolean; onValueChange: (value: boolean) => void}) {
  return <View style={styles.toggleLine}>
    <View style={styles.flex}><Text style={styles.toggleTitle}>{title}</Text><Text style={styles.helperText}>{description}</Text></View>
    <Switch value={value} onValueChange={onValueChange} trackColor={{false: '#CAD3E0', true: '#98D0AC'}} thumbColor={value ? C.green : '#FFFFFF'} />
  </View>;
}

export function Pill({text, tone}: {text: string; tone: 'blue' | 'green' | 'amber' | 'red' | 'gray'}) {
  const toneStyle = tone === 'green' ? styles.pillGreen : tone === 'amber' ? styles.pillAmber : tone === 'red' ? styles.pillRed : tone === 'gray' ? styles.pillGray : styles.pillBlue;
  return <View style={[styles.pill, toneStyle]}><Text style={[styles.pillText, toneStyle]}>{text}</Text></View>;
}

export function Notice({text, tone}: {text: string; tone: 'info' | 'error' | 'success'}) {
  const toneStyle = tone === 'error' ? styles.noticeError : tone === 'success' ? styles.noticeSuccess : styles.noticeInfo;
  const symbol = tone === 'error' ? '!' : tone === 'success' ? '✓' : 'i';
  return <View style={[styles.notice, toneStyle]}><Text style={[styles.noticeSymbol, toneStyle]}>{symbol}</Text><Text style={[styles.noticeText, toneStyle]}>{text}</Text></View>;
}

export function PrivacyNote({text}: {text: string}) {
  return <View style={styles.privacyNote}><Text style={styles.privacyIcon}>i</Text><Text style={styles.privacyText}>{text}</Text></View>;
}

export function EmptyState({icon, title, description}: {icon: string; title: string; description: string}) {
  return <View style={styles.emptyState}><View style={styles.emptyIcon}><Text style={styles.emptyIconText}>{icon}</Text></View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyDescription}>{description}</Text></View>;
}

export function SummaryCard({label, value, icon, tone}: {label: string; value: string; icon: string; tone: 'green' | 'blue' | 'amber'}) {
  const color = tone === 'green' ? C.green : tone === 'amber' ? C.amber : C.blue;
  const background = tone === 'green' ? C.greenSoft : tone === 'amber' ? C.amberSoft : C.paleBlue;
  return <View style={styles.summaryCard}><View style={[styles.summaryIcon, backgroundStyle(background)]}><Text style={[styles.summaryIconText, textColorStyle(color)]}>{icon}</Text></View><Text style={styles.summaryValue}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text></View>;
}

export function QuickAction({icon, label, color, onPress}: {icon: string; label: string; color: string; onPress: () => void}) {
  return <TouchableOpacity style={styles.quickAction} onPress={onPress}><View style={[styles.quickIcon, backgroundStyle(`${color}14`)]}><Text style={[styles.quickIconText, textColorStyle(color)]}>{icon}</Text></View><Text style={styles.quickLabel}>{label}</Text><Text style={styles.quickArrow}>›</Text></TouchableOpacity>;
}

export function FarmRow({property, onPress, selected}: {property: FarmProperty; onPress: () => void; selected: boolean}) {
  const {t} = useLanguage();
  const hasPin = property.latitude !== null && property.longitude !== null;
  const pinDetails = property.location_source
    ? `${t(farmLocationSourceLabel(property.location_source))}${property.location_source === 'gps' && property.gps_accuracy_m !== null && property.gps_accuracy_m !== undefined ? ` · ±${Math.round(property.gps_accuracy_m)} m` : ''}`
    : t('Pin saved');
  return <TouchableOpacity style={[styles.farmRow, selected && styles.farmRowSelected]} onPress={onPress}>
    <View style={styles.farmPin}><Text style={styles.farmPinText}>⌖</Text></View>
    <View style={styles.flex}><NativeText style={styles.farmName}>{property.name}</NativeText><NativeText style={styles.farmAddress}>{property.address || [property.barangay, property.municipality, property.province].filter(Boolean).join(' · ')}</NativeText></View>
    <View style={styles.farmMeta}><Text style={styles.farmArea}>{property.size_hectares ? `${property.size_hectares} ha` : t('Size not set')}</Text><Text style={styles.farmPinStatus}>{hasPin ? pinDetails : t('Area only')}</Text></View>
  </TouchableOpacity>;
}

export function SeverityBadge({severity, range: reportedRange}: {severity: string; range?: string | null}) {
  const {t} = useLanguage();
  const {resolvedTheme} = useTheme();
  const normalized = severity === 'Low' ? 'Mild' : severity;
  const style = severityBadgeStyle(normalized, resolvedTheme === 'dark');
  const range = reportedRange || style.range;
  const label = t(style.label || normalized || 'Not assessed');
  const hasSeverity = style.label !== undefined;
  const text = hasSeverity ? `${label}${range ? ` · ${range}` : ''}` : label;
  return <View style={[styles.pill, backgroundStyle(style.backgroundColor)]} accessible accessibilityRole="text" accessibilityLabel={hasSeverity ? `${label}${range ? `, ${range} ${t('crop damage')}` : ''}` : text}>
    <Text style={[styles.pillText, textColorStyle(style.color)]}>{text}</Text>
  </View>;
}

export function ReportRow({report, onPress}: {report: FieldReport; onPress?: () => void}) {
  const {t} = useLanguage();
  const tone = report.verification_status === 'Confirmed' ? 'green' : report.verification_status === 'No detection' ? 'gray' : 'amber';
  return <TouchableOpacity style={styles.reportRow} onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={onPress ? `View report ${report.code}, ${report.farmer_severity} severity, ${report.verification_status}` : undefined}>
    <View style={styles.reportRowIcon}><Text style={styles.reportRowIconText}>▤</Text></View>
    <View style={styles.flex}><NativeText style={styles.reportRowName}>{report.property_name}</NativeText><NativeText style={styles.reportRowMeta}>{report.code} · {report.observed_at}</NativeText><NativeText style={styles.reportRowSub}>{report.municipality}, {report.province}</NativeText></View>
    <View style={styles.reportRowBadges}><SeverityBadge severity={report.farmer_severity} range={report.farmer_severity_range} /><Pill text={t(report.verification_status)} tone={tone} /></View>
  </TouchableOpacity>;
}

export function QueuedReportRow({
  item,
  uploadProgress,
  networkConnected,
  busy,
  onRetryPhoto,
}: {
  item: QueuedReport;
  uploadProgress: PhotoUploadProgress | null;
  networkConnected: boolean;
  busy: boolean;
  onRetryPhoto: (clientSubmissionId: string, photoId: string) => Promise<void>;
}) {
  const {t} = useLanguage();
  const photoCount = item.photoCount ?? item.photos.length + (item.syncedPhotoCount ?? 0);
  const syncedPhotoCount = item.syncedPhotoCount ?? 0;
  const syncStatus = item.serverReportId
    ? photoCount > 0
      ? `${syncedPhotoCount}/${photoCount} ${t('photos synced')}`
      : t('Report synced to RSSI')
    : t('Report saved on this device · waiting to sync');

  return <View style={styles.reportRow}>
    <View style={[styles.reportRowIcon, styles.queuedReportIcon]}><Text style={[styles.reportRowIconText, styles.queuedReportIconText]}>↻</Text></View>
    <View style={styles.flex}>
      <NativeText style={styles.reportRowName}>{item.propertyName}</NativeText>
      <NativeText style={styles.reportRowMeta}>{item.propertyMunicipality}, {item.propertyProvince}</NativeText>
      <Text style={styles.reportRowSub}>{syncStatus}</Text>
      {item.lastError ? <NativeText style={styles.queueError}>{item.lastError}</NativeText> : null}
      {item.photos.map((photo, index) => {
        const isUploading = uploadProgress?.clientSubmissionId === item.clientSubmissionId && uploadProgress.photoId === photo.id;
        const photoStatus = isUploading
          ? uploadProgress.percent == null ? t('Uploading…') : `${t('Uploading')} · ${uploadProgress.percent}%`
          : photo.lastError ? t('Upload failed') : t('Saved on this device · waiting to upload');
        return <View key={photo.id} style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap'}}>
          <NativeText style={{color: C.ink, fontSize: 11, flexShrink: 1}} numberOfLines={1}>{photo.name || `Photo ${index + 1}`}</NativeText>
          <Text style={{color: isUploading ? C.blue : photo.lastError ? C.red : C.muted, fontSize: 10}}>{photoStatus}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`${t(photo.lastError ? 'Retry photo' : 'Upload photo')} ${index + 1}`}
            onPress={() => void onRetryPhoto(item.clientSubmissionId, photo.id)}
            disabled={!item.serverReportId || !networkConnected || busy || isUploading}
            style={{paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: C.line, borderRadius: 7, opacity: !item.serverReportId || !networkConnected || busy || isUploading ? 0.5 : 1}}
          ><Text style={{color: C.blue, fontSize: 10, fontWeight: '700'}}>{t(photo.lastError ? 'Retry photo' : 'Upload photo')}</Text></TouchableOpacity>
        </View>;
      })}
    </View>
    <View style={styles.reportRowBadges}><SeverityBadge severity={String(item.body.farmerSeverity || 'Not assessed')} /><Pill text="Pending" tone="amber" /></View>
  </View>;
}

export function CommunityCard({item, onConfirm, disabled, token}: {item: CommunityUpdate; onConfirm: () => void; disabled: boolean; token: string}) {
  const {t} = useLanguage();
  const [viewerPhoto, setViewerPhoto] = useState<{uri: string; index: number} | null>(null);
  return <View style={styles.communityCard}>
    <View style={styles.communityHeader}><SeverityBadge severity={item.farmer_severity} range={item.farmer_severity_range} /><NativeText style={styles.communityDate}>{item.observed_at} · {item.municipality}, {item.province}</NativeText></View>
    <NativeText style={styles.communityTitle}>{item.observations}</NativeText>
    <NativeText style={styles.bodyText}>{item.damage_description}</NativeText>
    {item.photos?.length ? <View style={styles.communityPhotoGrid}>
      {item.photos.map((photo, index) => {
        const uri = getProfilePhotoUri(photo.url);
        return uri ? <TouchableOpacity
          key={photo.id}
          onPress={() => setViewerPhoto({uri, index})}
          accessibilityRole="button"
          accessibilityLabel={`${t(`Shared observation photo ${index + 1}`)}. ${t('Tap to zoom')}`}
          style={styles.communityPhotoButton}
        ><Image
          source={{uri, headers: {Authorization: `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true'}}}
          style={[styles.communityPhoto, {width: '100%'}]}
          resizeMode="cover"
          accessibilityLabel={t(`Shared observation photo ${index + 1}`)}
        /></TouchableOpacity> : null;
      })}
    </View> : null}
    <View style={styles.communityFoot}><Text style={styles.communityStatus}>{t('SRA status')}: {t(item.verification_status)}</Text><Text style={styles.communityStatus}>{t(`${item.confirmation_count} agreed`)}</Text></View>
    <Button label={item.confirmed_by_me ? 'You agreed with this observation' : 'I observed something similar'} onPress={onConfirm} disabled={disabled} kind={item.confirmed_by_me ? 'light' : 'light'} />
    <Text style={styles.helperText}>Agreement is not an official verification.</Text>
    {viewerPhoto ? <PhotoViewer
      uri={viewerPhoto.uri}
      token={token}
      label={t(`Shared observation photo ${viewerPhoto.index + 1}`)}
      onClose={() => setViewerPhoto(null)}
    /> : null}
  </View>;
}

function PhotoViewer({uri, token, label, onClose}: {uri: string; token: string; label: string; onClose: () => void}) {
  const {width, height} = useWindowDimensions();
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({x: 0, y: 0});
  const scaleRef = useRef(1);
  const offsetRef = useRef({x: 0, y: 0});
  const initialScale = useRef(1);
  const initialOffset = useRef({x: 0, y: 0});
  const initialDistance = useRef(0);
  const distanceBetweenTouches = (touches: readonly {pageX: number; pageY: number}[]) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: event => {
      initialScale.current = scaleRef.current;
      initialOffset.current = offsetRef.current;
      initialDistance.current = distanceBetweenTouches(event.nativeEvent.touches);
    },
    onPanResponderMove: (event, gesture) => {
      const touchDistance = distanceBetweenTouches(event.nativeEvent.touches);
      if (touchDistance > 0) {
        if (!initialDistance.current) {
          initialDistance.current = touchDistance;
          initialScale.current = scaleRef.current;
        }
        const nextScale = Math.max(1, Math.min(5, initialScale.current * touchDistance / initialDistance.current));
        scaleRef.current = nextScale;
        setScale(nextScale);
        if (nextScale === 1) {
          offsetRef.current = {x: 0, y: 0};
          initialOffset.current = offsetRef.current;
          setOffset(offsetRef.current);
        }
        return;
      }
      if (initialDistance.current) {
        initialDistance.current = 0;
        initialOffset.current = offsetRef.current;
      }
      if (scaleRef.current > 1) {
        const maxX = (width * (scaleRef.current - 1)) / 2;
        const maxY = (height * (scaleRef.current - 1)) / 2;
        const nextOffset = {
          x: Math.max(-maxX, Math.min(maxX, initialOffset.current.x + gesture.dx)),
          y: Math.max(-maxY, Math.min(maxY, initialOffset.current.y + gesture.dy)),
        };
        offsetRef.current = nextOffset;
        setOffset(nextOffset);
      }
    },
    onPanResponderRelease: () => {
      initialDistance.current = 0;
      initialScale.current = scaleRef.current;
      initialOffset.current = offsetRef.current;
    },
    onPanResponderTerminate: () => {
      initialDistance.current = 0;
      initialScale.current = scaleRef.current;
      initialOffset.current = offsetRef.current;
    },
  })).current;

  return <Modal visible animationType="fade" transparent onRequestClose={onClose} statusBarTranslucent>
    <View style={{flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.96)', justifyContent: 'center', alignItems: 'center'}}>
      <View style={{width, height, justifyContent: 'center', alignItems: 'center'}} {...panResponder.panHandlers}>
        <Image
          source={{uri, headers: {Authorization: `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true'}}}
          resizeMode="contain"
          accessibilityLabel={label}
          style={{width, height, transform: [{translateX: offset.x}, {translateY: offset.y}, {scale}]}}
        />
      </View>
      <TouchableOpacity
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close photo"
        hitSlop={10}
        style={{position: 'absolute', top: 42, right: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(40, 40, 40, 0.85)', alignItems: 'center', justifyContent: 'center'}}
      ><NativeText style={{color: '#FFFFFF', fontSize: 30, lineHeight: 34}}>×</NativeText></TouchableOpacity>
    </View>
  </Modal>;
}

export function InfoRow({label, value, compact = false, translateValue = false}: {label: string; value: string; compact?: boolean; translateValue?: boolean}) {
  const {t} = useLanguage();
  return <View style={[styles.infoRow, compact && styles.infoRowCompact]}><Text style={styles.infoLabel}>{t(label)}</Text>{translateValue ? <Text style={styles.infoValue}>{t(value)}</Text> : <NativeText style={styles.infoValue}>{value}</NativeText>}</View>;
}

export function Avatar({name, photoUrl, photoCacheKey, localUri, token, size = 48}: {
  name: string;
  photoUrl?: string | null;
  photoCacheKey?: string;
  localUri?: string | null;
  token?: string | null;
  size?: number;
}) {
  const remoteUri = getProfilePhotoUri(photoUrl, photoCacheKey);
  const uri = localUri || remoteUri;
  return <View style={[styles.avatar, avatarSizeStyle(size)]}>
    {uri ? <Image source={{uri, ...(remoteUri && !localUri && token ? {headers: {Authorization: `Bearer ${token}`}} : {})}} resizeMode="cover" style={styles.avatarImage} /> : <Text style={[styles.avatarText, avatarInitialStyle(size)]}>{name.trim().charAt(0).toUpperCase()}</Text>}
  </View>;
}

export function ProfilePhotoPicker({name, photoUrl, photoCacheKey, token, selectedPhoto, onSelect, disabled = false}: {
  name: string;
  photoUrl?: string | null;
  photoCacheKey?: string;
  token?: string | null;
  selectedPhoto: Asset | null;
  onSelect: (photo: Asset) => void;
  disabled?: boolean;
}) {
  const {t} = useLanguage();
  const [error, setError] = React.useState('');

  const choosePhoto = async () => {
    setError('');
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.8,
        assetRepresentationMode: 'compatible',
      });
      if (result.didCancel) return;
      if (result.errorCode) {
        setError(t('Could not select that profile photo. Try another image.'));
        return;
      }
      const photo = result.assets?.[0];
      if (!photo?.uri || (typeof photo.fileSize === 'number' && photo.fileSize > 5 * 1024 * 1024)) {
        setError(t(photo?.uri ? 'Profile photos must be 5 MB or smaller.' : 'Choose a profile photo and try again.'));
        return;
      }
      onSelect(photo);
    } catch {
      setError(t('Could not select that profile photo. Try another image.'));
    }
  };

  return <View style={styles.profilePhotoField}>
    <Avatar name={name} photoUrl={photoUrl} photoCacheKey={photoCacheKey} localUri={selectedPhoto?.uri} token={token} size={72} />
    <View style={styles.flex}>
      <Text style={styles.inputLabel}>Profile picture (optional)</Text>
      <Text style={styles.helperText}>Use a clear photo so your SRA team can recognize your account.</Text>
      <Button label={selectedPhoto || photoUrl ? 'Change profile picture' : 'Choose profile picture'} onPress={choosePhoto} disabled={disabled} kind="light" />
      {error ? <Text style={styles.queueError}>{error}</Text> : null}
    </View>
  </View>;
}

export function NavButton({icon, label, active, onPress, badge = 0}: {icon: string; label: string; active: boolean; onPress: () => void; badge?: number}) {
  return <TouchableOpacity style={styles.navButton} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
    <View style={[styles.navIconWrap, active && styles.navIconWrapActive]}><Text style={[styles.navIconText, active && styles.navIconTextActive]}>{icon}</Text>{badge > 0 ? <View style={styles.navBadge}><Text style={styles.navBadgeText}>{badge > 9 ? '9+' : badge}</Text></View> : null}</View>
    <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
  </TouchableOpacity>;
}

export function LanguageSwitcher({title = true}: {title?: boolean}) {
  const {language, setLanguage, t} = useLanguage();
  return <View style={styles.settingGroup}>
    {title ? <><Text style={styles.inputLabel}>{t('App language')}</Text><Text style={styles.helperText}>{t('Choose the language used in the app.')}</Text></> : null}
    <View style={styles.languageOptionsRow}>
      {(['en', 'tl', 'ceb'] as Language[]).map(option => {
        const selected = language === option;
        const label = option === 'en' ? 'English' : option === 'tl' ? 'Tagalog' : 'Cebuano';
        return <TouchableOpacity key={option} accessibilityRole="button" accessibilityState={{selected}} onPress={() => void setLanguage(option)} style={[styles.settingOption, styles.settingOptionLanguage, selected && styles.settingOptionActive]}>
          <Text style={[styles.settingOptionText, selected && styles.settingOptionTextActive]}>{label}</Text>
        </TouchableOpacity>;
      })}
    </View>
  </View>;
}

export function ThemeSwitcher() {
  const {mode, setMode} = useTheme();
  const {t} = useLanguage();
  const options: {mode: ThemeMode; label: string}[] = [
    {mode: 'system', label: 'System'},
    {mode: 'light', label: 'Light'},
    {mode: 'dark', label: 'Dark'},
  ];
  return <View style={styles.settingGroup}>
    <Text style={styles.inputLabel}>{t('Appearance')}</Text>
    <Text style={styles.helperText}>{t('Choose system, light, or dark appearance.')}</Text>
    <View style={styles.themeOptionsRow}>
      {options.map(option => {
        const selected = mode === option.mode;
        return <TouchableOpacity key={option.mode} accessibilityRole="button" accessibilityState={{selected}} accessibilityLabel={t(option.label)} onPress={() => void setMode(option.mode)} style={[styles.settingOption, styles.settingOptionTheme, selected && styles.settingOptionActive]}>
          <Text style={[styles.settingOptionText, styles.settingOptionTextTheme, selected && styles.settingOptionTextActive]}>{t(option.label)}</Text>
        </TouchableOpacity>;
      })}
    </View>
  </View>;
}
