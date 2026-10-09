import {API_BASE_URL, API_PREFIX} from './config';

export type Farmer = {
  id: number;
  reference: string;
  name: string;
  email: string;
  status: string;
};

export type FarmProperty = {
  id: number;
  name: string;
  province: string;
  municipality: string;
  barangay: string | null;
  size_hectares: string | null;
  latitude: number | null;
  longitude: number | null;
  location_consent: boolean;
};

export type FieldReport = {
  id: number;
  code: string;
  property_name: string;
  province: string;
  municipality: string;
  observed_at: string;
  submitted_at: string;
  observations: string;
  damage_description: string;
  farmer_severity: string;
  affected_area_hectares: string;
  verification_status: string;
  sra_severity: string | null;
  photos: Array<{id: number; name: string; url: string}>;
};

export type CommunityUpdate = {
  id: number;
  code: string;
  province: string;
  municipality: string;
  observed_at: string;
  submitted_at: string;
  observations: string;
  damage_description: string;
  farmer_severity: string;
  verification_status: string;
  confirmation_count: number;
  confirmed_by_me: boolean;
};

export type AuthResponse = {
  access_token: string;
  user: Farmer;
  properties?: FarmProperty[];
};

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message?: string) {
    super(message || humanizeCode(code));
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function humanizeCode(code: string): string {
  const messages: Record<string, string> = {
    invalid_credentials: 'That email and password did not match.',
    account_unavailable: 'This account is not available. Contact SRA support.',
    email_already_registered: 'An account already uses this email address.',
    unauthorized: 'Your session expired. Please sign in again.',
    precise_location_disabled: 'Precise farm pins are disabled by the workspace.',
    property_not_found: 'Select one of your saved farms and try again.',
    forbidden: 'This action is not available for this account.',
  };
  return messages[code] || code.replaceAll('_', ' ');
}

async function decodeResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const code = typeof body.error === 'string' ? body.error : `http_${response.status}`;
    const detail = typeof body.message === 'string' ? body.message : undefined;
    throw new ApiError(response.status, code, detail || humanizeCode(code));
  }
  return body as T;
}

export async function apiRequest<T>(
  path: string,
  token?: string | null,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${API_PREFIX}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new ApiError(0, 'server_unavailable', 'Could not reach the RSSI server. Your report is safe on this device.');
  }
  return decodeResponse<T>(response);
}

export async function uploadPhotos(
  reportId: number,
  token: string,
  photos: Array<{id: string; uri: string; name: string; type: string}>,
): Promise<void> {
  const form = new FormData();
  photos.forEach(photo => {
    form.append('photos[]', {
      uri: photo.uri.startsWith('file://') ? photo.uri : `file://${photo.uri}`,
      name: photo.name,
      type: photo.type,
    } as unknown as Blob);
    form.append('photo_ids[]', photo.id);
  });
  const headers = new Headers({Accept: 'application/json', Authorization: `Bearer ${token}`});
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${API_PREFIX}/farmers/me/reports/${reportId}/photos`, {
      method: 'POST',
      headers,
      body: form,
    });
  } catch {
    throw new ApiError(0, 'server_unavailable', 'Could not upload report photos. They remain queued on this device.');
  }
  await decodeResponse(response);
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}
