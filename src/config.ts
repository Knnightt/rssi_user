// Development default for the SRA host. Farmers can change this in the sign-in
// screen, so the same app build can connect to another LAN or HTTPS deployment.
export const DEFAULT_API_BASE_URL = 'http://192.168.15.5:8000';

let apiBaseUrl = DEFAULT_API_BASE_URL;

export function normalizeApiBaseUrl(value: string): string {
  const candidate = value.trim().replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('Enter a complete server address, such as http://192.168.15.5:8000.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('Use an http:// or https:// server address without a path, query, or password.');
  }
  return `${parsed.protocol}//${parsed.host}`;
}

export function configureApiBaseUrl(value: string): string {
  apiBaseUrl = normalizeApiBaseUrl(value);
  return apiBaseUrl;
}

export function getConfiguredApiBaseUrl(): string {
  return apiBaseUrl;
}

export const API_PREFIX = '/api/v1';
