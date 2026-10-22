import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import {
  createDarkStyles,
  createLightStyles,
} from '../assets/styles/appStyles';
export type ThemeMode = 'system' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';

const themeStorageKey = 'rssi_app_theme';
let activeTheme: ResolvedTheme = 'light';

const lightPalette = {
  blue: '#075EAA',
  blueDark: '#06477F',
  green: '#18834B',
  greenSoft: '#E8F4EC',
  ink: '#183247',
  muted: '#667B8C',
  line: '#D7E1E9',
  paper: '#FFFFFF',
  background: '#EEF3F7',
  paleBlue: '#EAF2F8',
  amber: '#A86A00',
  amberSoft: '#FFF5DB',
  red: '#B83B42',
  redSoft: '#FFF0F0',
};

const darkPalette = {
  blue: '#68a6ef',
  blueDark: '#8abaff',
  green: '#52c584',
  greenSoft: '#19392b',
  ink: '#e7eef6',
  muted: '#a8b7c7',
  line: '#34475b',
  paper: '#172637',
  background: '#0d1927',
  paleBlue: '#1b3046',
  amber: '#f0b954',
  amberSoft: '#42351e',
  red: '#f07b83',
  redSoft: '#42272d',
};

export const C = new Proxy(lightPalette, {
  get: (_target, key: string | symbol) => {
    const palette = activeTheme === 'dark' ? darkPalette : lightPalette;
    return palette[key as keyof typeof lightPalette];
  },
});

const lightStyles = createLightStyles(C);
const darkStyles = createDarkStyles(lightStyles, darkPalette);
export const styles = new Proxy(lightStyles, {
  get: (_target, key: string | symbol) => {
    const activeStyles = activeTheme === 'dark' ? darkStyles : lightStyles;
    return activeStyles[key as keyof typeof lightStyles];
  },
});

type ThemeContextValue = {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setMode: (mode: ThemeMode) => Promise<void>;
};
const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  resolvedTheme: 'light',
  setMode: async () => undefined,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(themeStorageKey)
      .then(saved => {
        if (
          mounted &&
          (saved === 'system' || saved === 'light' || saved === 'dark')
        )
          setModeState(saved);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  const resolvedTheme: ResolvedTheme =
    mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;
  activeTheme = resolvedTheme;
  const setMode = useCallback(async (next: ThemeMode) => {
    setModeState(next);
    try {
      await AsyncStorage.setItem(themeStorageKey, next);
    } catch {
      // Keep the selected appearance for this session if device storage fails.
    }
  }, []);
  const value = useMemo(
    () => ({ mode, resolvedTheme, setMode }),
    [mode, resolvedTheme, setMode],
  );
  return React.createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
