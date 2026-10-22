import React from 'react';
import AppProviders from './AppProviders';
import AppContent from './AppContent';

export default function AppRoot() {
  return (
    <AppProviders>
      <AppContent />
    </AppProviders>
  );
}
