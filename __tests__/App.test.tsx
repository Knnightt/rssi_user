/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(async () => ({isConnected: false, isInternetReachable: false})),
    addEventListener: jest.fn(() => jest.fn()),
  },
}));
jest.mock('@react-native-community/geolocation', () => ({
  __esModule: true,
  default: {getCurrentPosition: jest.fn(), requestAuthorization: jest.fn()},
}));
jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(),
  launchImageLibrary: jest.fn(),
}));
jest.mock('react-native-webview', () => ({
  WebView: 'WebView',
}));
jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: {DocumentDirectoryPath: '/tmp', writeFile: jest.fn()},
}));
jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: {WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY'},
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => true),
  resetGenericPassword: jest.fn(async () => true),
}));

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
