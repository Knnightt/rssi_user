import * as Keychain from 'react-native-keychain';

const serviceFor = (key: string) => `org.sra.rssi.${key}`;

export async function readSecure(key: string): Promise<string | null> {
  const item = await Keychain.getGenericPassword({service: serviceFor(key)});
  return item ? item.password : null;
}

export async function writeSecure(key: string, value: string): Promise<void> {
  await Keychain.setGenericPassword(key, value, {
    service: serviceFor(key),
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function removeSecure(key: string): Promise<void> {
  await Keychain.resetGenericPassword({service: serviceFor(key)});
}

export async function readSecureJson<T>(key: string, fallback: T): Promise<T> {
  const value = await readSecure(key);
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function writeSecureJson(key: string, value: unknown): Promise<void> {
  await writeSecure(key, JSON.stringify(value));
}
