import {PermissionsAndroid, Platform} from 'react-native';
import Geolocation from '@react-native-community/geolocation';

export type FarmLocationSource = 'gps' | 'address_lookup' | 'manual' | 'boundary' | 'unknown';
export type FarmCoordinates = {latitude: number; longitude: number; accuracy?: number; source?: FarmLocationSource};

export function farmLocationSourceLabel(source?: FarmLocationSource | null): string {
  switch (source) {
    case 'gps': return 'GPS fix';
    case 'address_lookup': return 'Address lookup estimate';
    case 'manual': return 'Placed on map';
    case 'boundary': return 'Boundary drawn on map';
    default: return 'Origin not recorded';
  }
}

function readCurrentPosition(options: {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
}): Promise<FarmCoordinates> {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      position => resolve({
        latitude: Number(position.coords.latitude.toFixed(7)),
        longitude: Number(position.coords.longitude.toFixed(7)),
        accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : undefined,
        source: 'gps',
      }),
      error => reject(error),
      {...options, distanceFilter: 0},
    );
  });
}

export async function captureFarmCoordinates(): Promise<FarmCoordinates> {
  if (Platform.OS === 'android') {
    const permissions = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    ]);
    const hasFineLocation = permissions[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
    const hasCoarseLocation = permissions[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
    if (!hasFineLocation && !hasCoarseLocation) {
      throw new Error('Location permission was not granted. Allow location access in Settings, or place the pin manually on the map.');
    }
  }

  if (Platform.OS === 'ios') {
    await new Promise<void>((resolve, reject) => {
      Geolocation.requestAuthorization(resolve, () => reject(new Error('Location permission was not granted.')));
    });
  }

  try {
    // A cached or network-based fix is usually much faster and works with
    // Android's approximate-location permission. The pin remains draggable.
    return await readCurrentPosition({enableHighAccuracy: false, timeout: 12000, maximumAge: 120000});
  } catch {
    try {
      return await readCurrentPosition({enableHighAccuracy: true, timeout: 30000, maximumAge: 0});
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/timeout/i.test(message)) {
        throw new Error('Could not get a location fix. Turn on Location and Wi-Fi, then try again outdoors, or place the pin manually on the map.');
      }
      throw new Error(message || 'Could not read your current location. Check that Location is turned on, or place the pin manually on the map.');
    }
  }
}
