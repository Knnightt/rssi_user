import {API_PREFIX, getConfiguredApiBaseUrl} from './config';
import type {Asset} from 'react-native-image-picker';

export type Farmer = {
  id: number;
  reference: string;
  name: string;
  username?: string | null;
  phone_number?: string | null;
  email: string | null;
  status: string;
  profile_photo_url?: string | null;
  profile_photo_cache_key?: string;
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
  boundary_coordinates?: Array<{latitude: number; longitude: number}>;
  location_consent: boolean;
  location_source?: 'gps' | 'address_lookup' | 'manual' | 'boundary' | 'unknown' | null;
  gps_accuracy_m?: number | null;
};

export type ReportProgressEvent = {
  id: string;
  type: 'submitted' | 'review' | 'visit_scheduled' | 'visit_updated';
  occurred_at: string;
  verification_status?: string | null;
  sra_severity?: string | null;
  scheduled_for?: string | null;
  completed_at?: string | null;
  farmer_message?: string | null;
  visit_status?: 'scheduled' | 'completed' | 'cancelled' | null;
  findings?: string | null;
  checkings?: Array<{label: string; result: string; finding: string | null}>;
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
  follow_up_at?: string | null;
  review_completed_at?: string | null;
  farmer_message?: string | null;
  progress?: ReportProgressEvent[];
  crop_characteristics?: {
    plant_height_cm: number | null;
    leaves_per_stalk: number | null;
    leaf_length_cm: number | null;
    leaf_width_cm: number | null;
    tiller_count: number | null;
    measurement_date: string | null;
    crop_variety: string | null;
    growth_stage: string | null;
    sample_count: number | null;
  };
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
  photos?: Array<{id: number; name: string; url: string}>;
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
const barangayGeocodeCache = new Map<string, FarmCoordinatesResult>();

export type FarmCoordinatesResult = {latitude: number; longitude: number; formattedAddress: string};

/** Finds an approximate center for a selected barangay using OpenStreetMap Nominatim. */
export function geocodeFarmBarangayLocation(place: {province: string; municipality: string; barangay: string}): Promise<FarmCoordinatesResult> {
  const key = [place.barangay, place.municipality, place.province, 'Philippines'].join(', ').toLocaleLowerCase();
  const cached = barangayGeocodeCache.get(key);
  if (cached) return Promise.resolve(cached);
  const lookup = reverseGeocodeQueue.then(async () => {
    const queuedCache = barangayGeocodeCache.get(key);
    if (queuedCache) return queuedCache;
    const waitMs = Math.max(0, 1100 - (Date.now() - lastReverseGeocodeAt));
    if (waitMs) await new Promise<void>(resolve => setTimeout(resolve, waitMs));
    lastReverseGeocodeAt = Date.now();
    const query = new URLSearchParams({
      format: 'jsonv2',
      addressdetails: '1',
      limit: '1',
      q: `${place.barangay}, ${place.municipality}, ${place.province}, Philippines`,
    });
    let response: Response;
    try {
      response = await fetch(`https://nominatim.openstreetmap.org/search?${query.toString()}`, {
        headers: {Accept: 'application/json', 'User-Agent': 'RSSI-Farmer-App/1.0'},
      });
    } catch {
      throw new ApiError(0, 'barangay_geocode_unavailable', 'Could not find this barangay on the map. You can still move the map manually.');
    }
    if (!response.ok) throw new ApiError(response.status, 'barangay_geocode_failed', 'Could not find this barangay on the map. You can still move the map manually.');
    const results = await response.json() as Array<{lat?: string; lon?: string; display_name?: string}>;
    const result = results[0];
    const latitude = Number(result?.lat);
    const longitude = Number(result?.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new ApiError(404, 'barangay_not_found', 'Could not find this barangay on the map. You can still move the map manually.');
    }
    const coordinates = {latitude, longitude, formattedAddress: result?.display_name || key};
    barangayGeocodeCache.set(key, coordinates);
    return coordinates;
  });
  reverseGeocodeQueue = lookup.then(() => undefined, () => undefined);
  return lookup;
}

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

const errorMessages: Record<string, string> = {
  invalid_credentials: 'Username or password is incorrect.',
  invalid_or_expired_reset_code: 'Code expired or incorrect. Request a new one.',
  rate_limit_exceeded: 'Too many attempts. Try again later.',
  account_unavailable: 'Account inactive. Contact SRA.',
  email_already_registered: 'Email already in use.',
  username_already_registered: 'Username already in use. Choose another.',
  invalid_philippine_mobile_number: 'Enter a valid phone number.',
  unauthorized: 'Session expired. Sign in again.',
  precise_location_disabled: 'Exact farm locations are unavailable right now.',
  property_not_found: 'Farm no longer available. Choose it again.',
  report_not_found: 'Report no longer available.',
  community_report_not_found: 'Shared report no longer available.',
  photo_not_found: 'Photo no longer available.',
  photo_limit_exceeded: 'Choose up to five photos.',
  invalid_photo: 'Choose JPG or PNG photos under 10 MB.',
  invalid_photo_ids: 'Select the photos again and retry.',
  invalid_profile_photo: 'Choose a profile photo and try again.',
  invalid_boundary: 'Check the farm boundary and try again.',
  invalid_observed_date: 'Enter a valid observation date.',
  invalid_verification_code: 'Code expired or incorrect. Request a new one.',
  phone_verification_required: 'Verify your phone number to continue.',
  phone_verification_disabled: 'Phone verification is off. Try again.',
  forbidden: "This action isn't available for your account.",
  unexpected_request_body: 'Update the app and try again.',
};

const statusMessages: Record<number, string> = {
  400: 'Check the information and try again.',
  401: 'Session expired. Sign in again.',
  403: "This action isn't available for your account.",
  404: 'This item is no longer available.',
  409: 'This item changed. Refresh and try again.',
  413: 'File is too large.',
  415: 'Choose a supported file type.',
  422: 'Check the information and try again.',
  429: 'Too many attempts. Try again later.',
};

function humanizeCode(code: string): string {
  if (errorMessages[code]) return errorMessages[code];
  const httpStatus = /^http_(\d{3})$/.exec(code);
  if (httpStatus) return statusMessages[Number(httpStatus[1])] || 'Could not complete this. Try again.';
  return 'Could not complete this. Try again.';
}

function serverErrorMessage(path: string): string {
  if (path === '/auth/login') return "Can't sign in right now. Try again later.";
  if (path === '/auth/register') return "Sign-up didn't finish. Try signing in; the account may exist.";
  if (path.startsWith('/farmers/me/reports')) return "Couldn't sync your report. It's saved on this device.";
  if (path === '/me/profile-photo') return "Couldn't upload your photo. Try again later.";
  if (path.includes('phone-verification')) return "Couldn't verify your phone. Try again later.";
  return "Couldn't load this. Try again later.";
}

async function decodeResponse<T>(response: Response, path = ''): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const code = typeof body.error === 'string' ? body.error : `http_${response.status}`;
    const message = response.status >= 500
      ? serverErrorMessage(path)
      : errorMessages[code] || (path === '/auth/login'
        ? "Can't sign in right now. Try again later."
        : statusMessages[response.status] || 'Could not complete this. Try again.');
    throw new ApiError(response.status, code, message);
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
    const message = path === '/auth/login'
      ? "Can't sign in right now. Check your internet and try again."
      : path.startsWith('/farmers/me/reports')
        ? "Can't sync now. Your report is saved on this device."
        : "Can't connect. Check your internet and try again.";
    throw new ApiError(0, 'server_unavailable', message);
  }
  return decodeResponse<T>(response, path);
}

/** Build the server URL for an authenticated profile photo returned by the API. */
export function getProfilePhotoUri(photoUrl?: string | null, cacheKey?: string): string | undefined {
  if (!photoUrl) return undefined;
  const uri = /^https?:\/\//i.test(photoUrl)
    ? photoUrl
    : `${getConfiguredApiBaseUrl().replace(/\/+$/, '')}${photoUrl.startsWith('/') ? '' : '/'}${photoUrl}`;
  if (!cacheKey) return uri;
  return `${uri}${uri.includes('?') ? '&' : '?'}v=${encodeURIComponent(cacheKey)}`;
}

/** Upload a farmer profile photo using the authenticated profile-photo endpoint. */
export async function uploadProfilePhoto(token: string, photo: Asset): Promise<{profile_photo_url: string | null}> {
  if (!photo.uri) throw new ApiError(422, 'invalid_profile_photo', 'Choose a profile photo and try again.');
  const form = new FormData();
  form.append('photo', {
    uri: photo.uri,
    name: photo.fileName || `rssi-profile-${Date.now()}.jpg`,
    type: photo.type || 'image/jpeg',
  } as unknown as Blob);
  const headers = new Headers({
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'ngrok-skip-browser-warning': 'true',
  });
  let response: Response;
  try {
    response = await fetch(`${getConfiguredApiBaseUrl()}${API_PREFIX}/me/profile-photo`, {
      method: 'POST',
      headers,
      body: form,
    });
  } catch {
    throw new ApiError(0, 'server_unavailable', "Can't upload now. Try again later.");
  }
  return decodeResponse<{profile_photo_url: string | null}>(response, '/me/profile-photo');
}

/** Requests a single address lookup through the RSSI API; provider credentials stay server-side. */
export function geocodeFarmAddress(address: FarmAddressGeocodeRequest): Promise<FarmAddressGeocodeResult> {
  return apiRequest<FarmAddressGeocodeResult>('/geocoding/farm-address', undefined, {
    method: 'POST',
    body: JSON.stringify(address),
  });
}

export function uploadPhoto(
  reportId: number,
  token: string,
  photo: {id: string; uri: string; name: string; type: string},
  onProgress?: (percent: number | null) => void,
): Promise<void> {
  const form = new FormData();
  form.append('photos[]', {
    uri: photo.uri.startsWith('file://') ? photo.uri : `file://${photo.uri}`,
    name: photo.name,
    type: photo.type,
  } as unknown as Blob);
  form.append('photo_ids[]', photo.id);

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${getConfiguredApiBaseUrl()}${API_PREFIX}/farmers/me/reports/${reportId}/photos`);
    request.timeout = 60_000;
    request.setRequestHeader('Accept', 'application/json');
    request.setRequestHeader('Authorization', `Bearer ${token}`);
    request.setRequestHeader('ngrok-skip-browser-warning', 'true');
    request.upload.onprogress = event => {
      onProgress?.(event.lengthComputable && event.total > 0
        ? Math.min(99, Math.floor((event.loaded / event.total) * 100))
        : null);
    };
    request.onerror = () => reject(new ApiError(0, 'server_unavailable', "Can't upload now. The photo is saved on this device."));
    request.ontimeout = () => reject(new ApiError(0, 'upload_timeout', 'Upload timed out. The photo is saved here.'));
    request.onabort = () => reject(new ApiError(0, 'upload_cancelled', 'Upload stopped. The photo is saved here.'));
    request.onload = () => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(request.responseText || '{}') as Record<string, unknown>;
      } catch {
        // Keep the generic response for non-JSON proxy or server errors.
      }
      if (request.status < 200 || request.status >= 300) {
        const code = typeof body.error === 'string' ? body.error : `http_${request.status}`;
        const message = request.status >= 500
          ? "Couldn't upload the photo. It's saved on this device."
          : errorMessages[code] || statusMessages[request.status] || 'Could not upload the photo. Try again.';
        reject(new ApiError(request.status, code, message));
        return;
      }
      onProgress?.(100);
      resolve();
    };
    try {
      request.send(form);
    } catch {
      reject(new ApiError(0, 'server_unavailable', "Can't upload now. The photo is saved on this device."));
    }
  });
}
