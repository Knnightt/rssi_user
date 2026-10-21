import {PermissionsAndroid, Platform} from 'react-native';
import Geolocation from '@react-native-community/geolocation';

export type FarmCoordinates = {latitude: number; longitude: number};

export async function captureFarmCoordinates(): Promise<FarmCoordinates> {
  if (Platform.OS === 'android') {
    const permission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
      title: 'Use your farm location',
      message: 'Your current location is used to position the farm pin. It is sent with your registration only if you turn on precise-location consent.',
      buttonPositive: 'Allow once',
      buttonNegative: 'Not now',
    });
    if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error('Location permission was not granted. You can still save the farm without a GPS pin.');
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
      }),
      error => reject(new Error(error.message || 'Could not read your current location.')),
      {enableHighAccuracy: true, timeout: 20000, maximumAge: 10000},
    );
  });
}
