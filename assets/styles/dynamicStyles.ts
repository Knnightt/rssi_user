import { TextStyle, ViewStyle } from 'react-native';

export function backgroundStyle(backgroundColor: string): ViewStyle {
  return { backgroundColor };
}

export function textColorStyle(color: string): TextStyle {
  return { color };
}

export function avatarSizeStyle(size: number): ViewStyle {
  return { width: size, height: size, borderRadius: size / 2 };
}

export function avatarInitialStyle(size: number): TextStyle {
  return { fontSize: Math.max(13, Math.round(size * 0.42)) };
}

const severityPalette: Record<
  string,
  {
    label: string;
    range: string;
    color: string;
    background: string;
    darkColor: string;
    darkBackground: string;
  }
> = {
  Mild: {
    label: 'Mild',
    range: '1–20%',
    color: '#1D4ED8',
    background: '#EFF6FF',
    darkColor: '#8AB8FF',
    darkBackground: '#1B3049',
  },
  Moderate: {
    label: 'Moderate',
    range: '21–50%',
    color: '#854D0E',
    background: '#FEF3C7',
    darkColor: '#F4CF70',
    darkBackground: '#40351D',
  },
  Severe: {
    label: 'Severe',
    range: '51–70%',
    color: '#C2410C',
    background: '#FFEDD5',
    darkColor: '#FFAB72',
    darkBackground: '#432D20',
  },
  'Highly severe': {
    label: 'Highly severe',
    range: '71–100%',
    color: '#B91C1C',
    background: '#FEE2E2',
    darkColor: '#FF969C',
    darkBackground: '#42272D',
  },
};

export function severityBadgeStyle(
  severity: string,
  dark: boolean,
): { label?: string; range?: string; backgroundColor: string; color: string } {
  const tone = severityPalette[severity];
  if (!tone) {
    return {
      backgroundColor: dark ? '#293849' : '#EEF1F5',
      color: dark ? '#a8b7c7' : '#64748B',
    };
  }

  return {
    label: tone.label,
    range: tone.range,
    backgroundColor: dark ? tone.darkBackground : tone.background,
    color: dark ? tone.darkColor : tone.color,
  };
}
