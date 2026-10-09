import React from 'react';
import {ActivityIndicator, Image, Switch, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {CommunityUpdate, FarmProperty, FieldReport} from '../api';
import {QueuedReport} from '../reportQueue';
import {C, styles} from '../theme';

export function LoadingScreen() {
  return <SafeAreaView style={styles.loadingRoot}><BrandMark large /><ActivityIndicator color={C.blue} size="large" style={{marginTop: 18}} /><Text style={styles.loadingText}>Opening your RSSI workspace…</Text></SafeAreaView>;
}

export function BrandMark({large = false}: {large?: boolean}) {
  return <Image source={require('../../assets/rssi-logo.png')} resizeMode="contain" style={[styles.brandMark, large && styles.brandMarkLarge]} accessibilityLabel="RSSI logo" />;
}

export function PageIntro({eyebrow, title, subtitle, action}: {eyebrow: string; title: string; subtitle: string; action?: React.ReactNode}) {
  return <View style={styles.pageIntro}>
    <View style={styles.pageIntroRow}><View style={styles.flex}><Text style={styles.pageEyebrow}>{eyebrow}</Text><Text style={styles.pageTitle}>{title}</Text></View>{action}</View>
    <Text style={styles.pageSub}>{subtitle}</Text>
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
  return <View style={styles.summaryCard}><View style={[styles.summaryIcon, {backgroundColor: background}]}><Text style={[styles.summaryIconText, {color}]}>{icon}</Text></View><Text style={styles.summaryValue}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text></View>;
}

export function QuickAction({icon, label, color, onPress}: {icon: string; label: string; color: string; onPress: () => void}) {
  return <TouchableOpacity style={styles.quickAction} onPress={onPress}><View style={[styles.quickIcon, {backgroundColor: `${color}14`}]}><Text style={[styles.quickIconText, {color}]}>{icon}</Text></View><Text style={styles.quickLabel}>{label}</Text><Text style={styles.quickArrow}>›</Text></TouchableOpacity>;
}

export function FarmRow({property, onPress, selected}: {property: FarmProperty; onPress: () => void; selected: boolean}) {
  return <TouchableOpacity style={[styles.farmRow, selected && styles.farmRowSelected]} onPress={onPress}>
    <View style={styles.farmPin}><Text style={styles.farmPinText}>⌖</Text></View>
    <View style={styles.flex}><Text style={styles.farmName}>{property.name}</Text><Text style={styles.farmAddress}>{[property.barangay, property.municipality, property.province].filter(Boolean).join(' · ')}</Text></View>
    <View style={styles.farmMeta}><Text style={styles.farmArea}>{property.size_hectares ? `${property.size_hectares} ha` : 'Size not set'}</Text><Text style={styles.farmPinStatus}>{property.latitude !== null && property.longitude !== null ? 'Pin saved' : 'Area only'}</Text></View>
  </TouchableOpacity>;
}

export function ReportRow({report, onPress}: {report: FieldReport; onPress?: () => void}) {
  const tone = report.verification_status === 'Confirmed' ? 'green' : report.verification_status === 'No detection' ? 'gray' : 'amber';
  return <TouchableOpacity style={styles.reportRow} onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={onPress ? `View report ${report.code}` : undefined}>
    <View style={styles.reportRowIcon}><Text style={styles.reportRowIconText}>▤</Text></View>
    <View style={styles.flex}><Text style={styles.reportRowName}>{report.property_name}</Text><Text style={styles.reportRowMeta}>{report.code} · {report.observed_at}</Text><Text style={styles.reportRowSub}>{report.municipality}, {report.province}</Text></View>
    <Pill text={report.verification_status} tone={tone} />
  </TouchableOpacity>;
}

export function QueuedReportRow({item}: {item: QueuedReport}) {
  return <View style={styles.reportRow}>
    <View style={[styles.reportRowIcon, {backgroundColor: C.amberSoft}]}><Text style={[styles.reportRowIconText, {color: C.amber}]}>↻</Text></View>
    <View style={styles.flex}><Text style={styles.reportRowName}>{item.propertyName}</Text><Text style={styles.reportRowMeta}>{item.propertyMunicipality}, {item.propertyProvince}</Text><Text style={styles.reportRowSub}>{item.photos.length > 0 ? `Waiting to upload ${item.photos.length} photo${item.photos.length === 1 ? '' : 's'}` : 'Waiting for server connection'}</Text>{item.lastError ? <Text style={styles.queueError}>{item.lastError}</Text> : null}</View>
    <Pill text="Pending" tone="amber" />
  </View>;
}

export function CommunityCard({item, onConfirm, disabled}: {item: CommunityUpdate; onConfirm: () => void; disabled: boolean}) {
  return <View style={styles.communityCard}>
    <View style={styles.communityHeader}><Pill text={item.farmer_severity} tone={item.farmer_severity === 'Severe' ? 'red' : item.farmer_severity === 'Moderate' ? 'amber' : 'green'} /><Text style={styles.communityDate}>{item.observed_at} · {item.municipality}, {item.province}</Text></View>
    <Text style={styles.communityTitle}>{item.observations}</Text>
    <Text style={styles.bodyText}>{item.damage_description}</Text>
    <View style={styles.communityFoot}><Text style={styles.communityStatus}>SRA status: {item.verification_status}</Text><Text style={styles.communityStatus}>{item.confirmation_count} agreed</Text></View>
    <Button label={item.confirmed_by_me ? 'You agreed with this observation' : 'I observed something similar'} onPress={onConfirm} disabled={disabled} kind={item.confirmed_by_me ? 'light' : 'light'} />
    <Text style={styles.helperText}>Agreement is not an official verification.</Text>
  </View>;
}

export function InfoRow({label, value, compact = false}: {label: string; value: string; compact?: boolean}) {
  return <View style={[styles.infoRow, compact && styles.infoRowCompact]}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>;
}

export function Avatar({name}: {name: string}) {
  return <View style={styles.avatar}><Text style={styles.avatarText}>{name.trim().charAt(0).toUpperCase()}</Text></View>;
}

export function NavButton({icon, label, active, onPress, badge = 0}: {icon: string; label: string; active: boolean; onPress: () => void; badge?: number}) {
  return <TouchableOpacity style={styles.navButton} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
    <View style={[styles.navIconWrap, active && styles.navIconWrapActive]}><Text style={[styles.navIconText, active && styles.navIconTextActive]}>{icon}</Text>{badge > 0 ? <View style={styles.navBadge}><Text style={styles.navBadgeText}>{badge > 9 ? '9+' : badge}</Text></View> : null}</View>
    <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
  </TouchableOpacity>;
}
