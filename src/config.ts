import {Platform} from 'react-native';

// Android emulators reach the host with 10.0.2.2; the iOS simulator uses localhost.
// For a physical device, replace this with the HTTPS URL or LAN address of the API.
export const API_BASE_URL = Platform.select({
  android: 'http://10.0.2.2:8000',
  ios: 'http://localhost:8000',
  default: 'http://localhost:8000',
})!;

export const API_PREFIX = '/api/v1';
