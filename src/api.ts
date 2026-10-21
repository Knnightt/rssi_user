import {API_PREFIX, getConfiguredApiBaseUrl} from './config';

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
  address: string | null;
  size_hectares: string | null;
  latitude: number | null;
  longitude: number | null;
  location_consent: boolean;
};

export type FieldReport = {
  id: number;
  code: string;
  property_name: string;
  property_id?: number | null;
  province: string;
  municipality: string;
  observed_at: string;
  submitted_at: string;
  observations: string;
  damage_description: string;
  farmer_severity: string;
  farmer_severity_range?: string | null;
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
  farmer_severity_range?: string | null;
  verification_status: string;
  confirmation_count: number;
  confirmed_by_me: boolean;
};

export type AuthResponse = {
  access_token: string;
  user: Farmer;
  properties?: FarmProperty[];
};

export type FarmAddressGeocodeRequest = {
  address: string;
  province: string;
  municipality: string;
  barangay: string;
  country: 'Philippines';
};

export type FarmAddressGeocodeResult = {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  confidence: number | null;
};

export type FarmReverseGeocodeResult = {
  displayName: string;
  address: Record<string, string>;
};

let lastReverseGeocodeAt = 0;
let reverseGeocodeQueue: Promise<void> = Promise.resolve();
const reverseGeocodeCache = new Map<string, FarmReverseGeocodeResult>();

/** A user-triggered OSM reverse lookup; keep requests at or below one per second. */
export function reverseGeocodeFarmLocation(coordinates: {latitude: number; longitude: number}): Promise<FarmReverseGeocodeResult> {
  const cacheKey = `${coordinates.latitude.toFixed(5)},${coordinates.longitude.toFixed(5)}`;
  const cached = reverseGeocodeCache.get(cacheKey);
  if (cached) return Promise.resolve(cached);
  const lookup = reverseGeocodeQueue.then(async () => {
    const queuedCache = reverseGeocodeCache.get(cacheKey);
    if (queuedCache) return queuedCache;
    const waitMs = Math.max(0, 1100 - (Date.now() - lastReverseGeocodeAt));
    if (waitMs) await new Promise<void>(resolve => setTimeout(resolve, waitMs));
    lastReverseGeocodeAt = Date.now();

    const query = `format=jsonv2&addressdetails=1&zoom=18&lat=${encodeURIComponent(String(coordinates.latitude))}&lon=${encodeURIComponent(String(coordinates.longitude))}`;
    let response: Response;
    try {
      response = await fetch(`https://nominatim.openstreetmap.org/reverse?${query}`, {
        headers: {Accept: 'application/json', 'User-Agent': 'RSSI-Farmer-App/1.0'},
      });
    } catch {
      throw new ApiError(0, 'reverse_geocode_unavailable', 'Could not look up the address for this phone location.');
    }
    if (!response.ok) throw new ApiError(response.status, 'reverse_geocode_failed', 'Could not look up the address for this phone location.');
    const result = await response.json() as {display_name?: unknown; address?: unknown};
    const address = result.address && typeof result.address === 'object'
      ? Object.fromEntries(Object.entries(result.address).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
      : {};
    if (typeof result.display_name !== 'string' || !result.display_name.trim()) {
      throw new ApiError(404, 'reverse_geocode_not_found', 'No address was found for this phone location.');
    }
    const geocoded = {displayName: result.display_name, address};
    reverseGeocodeCache.set(cacheKey, geocoded);
    return geocoded;
  });
  reverseGeocodeQueue = lookup.then(() => undefined, () => undefined);
  return lookup;
}

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
  headers.set('ngrok-skip-browser-warning', 'true');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${getConfiguredApiBaseUrl()}${API_PREFIX}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new ApiError(0, 'server_unavailable', 'Could not reach the RSSI server. Your report is safe on this device.');
  }
  return decodeResponse<T>(response);
}

/** Requests a single address lookup through the RSSI API; provider credentials stay server-side. */
export function geocodeFarmAddress(address: FarmAddressGeocodeRequest): Promise<FarmAddressGeocodeResult> {
  return apiRequest<FarmAddressGeocodeResult>('/geocoding/farm-address', undefined, {
    method: 'POST',
    body: JSON.stringify(address),
  });
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
  const headers = new Headers({
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'ngrok-skip-browser-warning': 'true',
  });
  let response: Response;
  try {
    response = await fetch(`${getConfiguredApiBaseUrl()}${API_PREFIX}/farmers/me/reports/${reportId}/photos`, {
      method: 'POST',
      headers,
      body: form,
    });
  } catch {
    throw new ApiError(0, 'server_unavailable', 'Could not upload report photos. They remain queued on this device.');
  }
  await decodeResponse(response);
}
