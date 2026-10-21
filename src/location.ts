import {PermissionsAndroid, Platform} from 'react-native';
import Geolocation from '@react-native-community/geolocation';

export type FarmCoordinates = {latitude: number; longitude: number; accuracy?: number};

export async function captureFarmCoordinates(): Promise<FarmCoordinates> {
  if (Platform.OS === 'android') {
    const permissions = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    ]);
    if (permissions[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error('Precise location permission was not granted. Allow precise location in Settings, or place the pin manually on the map.');
    }
  }

  if (Platform.OS === 'ios') {
    await new Promise<void>((resolve, reject) => {
      Geolocation.requestAuthorization(resolve, () => reject(new Error('Location permission was not granted.')));
    });
  }

  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      position => resolve({
        latitude: Number(position.coords.latitude.toFixed(7)),
        longitude: Number(position.coords.longitude.toFixed(7)),
        accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : undefined,
      }),
      error => reject(new Error(error.message || 'Could not read your current location.')),
      {enableHighAccuracy: true, timeout: 30000, maximumAge: 0, distanceFilter: 0},
    );
  });
}
