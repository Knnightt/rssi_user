import React from 'react';
import {ActivityIndicator, Image, Switch, Text as NativeText, TextInput, TouchableOpacity, View} from 'react-native';
import {Asset, launchImageLibrary} from 'react-native-image-picker';
import {SafeAreaView} from 'react-native-safe-area-context';
import {CommunityUpdate, FarmProperty, FieldReport, getProfilePhotoUri} from '../api';
import {Language, LocalizedText as Text, useLanguage} from '../i18n';
import {QueuedReport} from '../reportQueue';
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
  keyboardType?: 'default' | 'email-address' | 'decimal-pad' | 'numeric' | 'url';
  multiline?: boolean;
  maxLength?: number;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  onBlur?: () => void;
}) {
  const {t} = useLanguage();
  return <View style={styles.fieldWrap}>
    <Text style={styles.inputLabel}>{t(props.label)}</Text>
    <TextInput
      value={props.value}
      onChangeText={props.onChangeText}
      onBlur={props.onBlur}
      placeholder={props.placeholder ? t(props.placeholder) : undefined}
      placeholderTextColor="#98A5B8"
      secureTextEntry={props.secureTextEntry}
      keyboardType={props.keyboardType || 'default'}
      multiline={props.multiline}
      maxLength={props.maxLength}
      autoCapitalize={props.autoCapitalize || 'sentences'}
      autoCorrect={!props.secureTextEntry && props.keyboardType !== 'email-address'}
      style={[styles.input, props.multiline && styles.multilineInput]}
      textAlignVertical={props.multiline ? 'top' : 'center'}
    />
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
  return <TouchableOpacity style={[styles.farmRow, selected && styles.farmRowSelected]} onPress={onPress}>
    <View style={styles.farmPin}><Text style={styles.farmPinText}>⌖</Text></View>
    <View style={styles.flex}><NativeText style={styles.farmName}>{property.name}</NativeText><NativeText style={styles.farmAddress}>{property.address || [property.barangay, property.municipality, property.province].filter(Boolean).join(' · ')}</NativeText></View>
    <View style={styles.farmMeta}><Text style={styles.farmArea}>{property.size_hectares ? `${property.size_hectares} ha` : t('Size not set')}</Text><Text style={styles.farmPinStatus}>{property.latitude !== null && property.longitude !== null ? t('Pin saved') : t('Area only')}</Text></View>
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

export function QueuedReportRow({item}: {item: QueuedReport}) {
  return <View style={styles.reportRow}>
    <View style={[styles.reportRowIcon, styles.queuedReportIcon]}><Text style={[styles.reportRowIconText, styles.queuedReportIconText]}>↻</Text></View>
    <View style={styles.flex}><NativeText style={styles.reportRowName}>{item.propertyName}</NativeText><NativeText style={styles.reportRowMeta}>{item.propertyMunicipality}, {item.propertyProvince}</NativeText><Text style={styles.reportRowSub}>{item.photos.length > 0 ? `Waiting to upload ${item.photos.length} photo${item.photos.length === 1 ? '' : 's'}` : 'Waiting for server connection'}</Text>{item.lastError ? <NativeText style={styles.queueError}>{item.lastError}</NativeText> : null}</View>
    <View style={styles.reportRowBadges}><SeverityBadge severity={String(item.body.farmerSeverity || 'Not assessed')} /><Pill text="Pending" tone="amber" /></View>
  </View>;
}

export function CommunityCard({item, onConfirm, disabled, token}: {item: CommunityUpdate; onConfirm: () => void; disabled: boolean; token: string}) {
  const {t} = useLanguage();
  return <View style={styles.communityCard}>
    <View style={styles.communityHeader}><SeverityBadge severity={item.farmer_severity} range={item.farmer_severity_range} /><NativeText style={styles.communityDate}>{item.observed_at} · {item.municipality}, {item.province}</NativeText></View>
    <NativeText style={styles.communityTitle}>{item.observations}</NativeText>
    <NativeText style={styles.bodyText}>{item.damage_description}</NativeText>
    {item.photos?.length ? <View style={styles.communityPhotoGrid}>
      {item.photos.map((photo, index) => {
        const uri = getProfilePhotoUri(photo.url);
        return uri ? <Image
          key={photo.id}
          source={{uri, headers: {Authorization: `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true'}}}
          style={styles.communityPhoto}
          resizeMode="cover"
          accessibilityLabel={t(`Shared observation photo ${index + 1}`)}
        /> : null;
      })}
    </View> : null}
    <View style={styles.communityFoot}><Text style={styles.communityStatus}>{t('SRA status')}: {t(item.verification_status)}</Text><Text style={styles.communityStatus}>{t(`${item.confirmation_count} agreed`)}</Text></View>
    <Button label={item.confirmed_by_me ? 'You agreed with this observation' : 'I observed something similar'} onPress={onConfirm} disabled={disabled} kind={item.confirmed_by_me ? 'light' : 'light'} />
    <Text style={styles.helperText}>Agreement is not an official verification.</Text>
  </View>;
}

export function InfoRow({label, value, compact = false, translateValue = false}: {label: string; value: string; compact?: boolean; translateValue?: boolean}) {
  const {t} = useLanguage();
  return <View style={[styles.infoRow, compact && styles.infoRowCompact]}><Text style={styles.infoLabel}>{t(label)}</Text>{translateValue ? <Text style={styles.infoValue}>{t(value)}</Text> : <NativeText style={styles.infoValue}>{value}</NativeText>}</View>;
}

export function Avatar({name, photoUrl, localUri, token, size = 48}: {
  name: string;
  photoUrl?: string | null;
  localUri?: string | null;
  token?: string | null;
  size?: number;
}) {
  const remoteUri = getProfilePhotoUri(photoUrl);
  const uri = localUri || remoteUri;
  return <View style={[styles.avatar, avatarSizeStyle(size)]}>
    {uri ? <Image source={{uri, ...(remoteUri && !localUri && token ? {headers: {Authorization: `Bearer ${token}`}} : {})}} resizeMode="cover" style={styles.avatarImage} /> : <Text style={[styles.avatarText, avatarInitialStyle(size)]}>{name.trim().charAt(0).toUpperCase()}</Text>}
  </View>;
}

export function ProfilePhotoPicker({name, photoUrl, token, selectedPhoto, onSelect, disabled = false}: {
  name: string;
  photoUrl?: string | null;
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
    <Avatar name={name} photoUrl={photoUrl} localUri={selectedPhoto?.uri} token={token} size={72} />
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
      {(['en', 'tl'] as Language[]).map(option => {
        const selected = language === option;
        const label = option === 'en' ? 'English' : 'Tagalog';
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
