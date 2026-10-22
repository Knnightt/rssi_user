import React, {ReactNode} from 'react';
import {StatusBar} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {LanguageProvider} from '../i18n';
import {ThemeProvider, useTheme} from '../theme';

type AppProvidersProps = {
  children: ReactNode;
};

function ThemedStatusBar() {
  const {resolvedTheme} = useTheme();
  return <StatusBar barStyle={resolvedTheme === 'dark' ? 'light-content' : 'dark-content'} />;
}

export default function AppProviders({children}: AppProvidersProps) {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <SafeAreaProvider>
          <ThemedStatusBar />
          {children}
        </SafeAreaProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
