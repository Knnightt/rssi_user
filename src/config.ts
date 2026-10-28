// The API endpoint is app configuration, not a user-editable setting.
// Keep this current with the active RSSI test deployment.
const API_BASE_URL = 'https://shelving-thicket-handrail.ngrok-free.dev';

export function getConfiguredApiBaseUrl(): string {
  return API_BASE_URL;
}

export const API_PREFIX = '/api/v1';
