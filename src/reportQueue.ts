import RNFS from 'react-native-fs';
import {apiRequest, AuthResponse, FarmProperty, FieldReport, uploadPhotos} from './api';
import {readSecureJson, writeSecureJson} from './secureStorage';

export type QueuedPhoto = {
  id: string;
  uri: string;
  name: string;
  type: string;
};

export type QueuedReport = {
  clientSubmissionId: string;
  body: Record<string, unknown>;
  propertyName: string;
  propertyProvince: string;
  propertyMunicipality: string;
  photos: QueuedPhoto[];
  serverReportId?: number;
  createdAt: string;
  lastError?: string;
};

export type MobileCache = {
  user: AuthResponse['user'];
  properties: FarmProperty[];
  reports: FieldReport[];
  refreshedAt: string;
};

const cacheKey = (userId: number) => `cache-${userId}`;
const queueKey = (userId: number) => `outbox-${userId}`;

export function createId(): string {
  const bytes = Array.from({length: 16}, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytes.map((value, index) => {
    const part = value.toString(16).padStart(2, '0');
    return [4, 6, 8, 10].includes(index) ? `-${part}` : part;
  }).join('');
}

export async function storePhoto(userId: number, uri: string, fileName: string, type: string): Promise<QueuedPhoto> {
  const extension = type === 'image/png' ? 'png' : 'jpg';
  const id = createId();
  const destination = `${RNFS.DocumentDirectoryPath}/rssi-${userId}-${id}.${extension}`;
  const source = uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
  await RNFS.copyFile(source, destination);
  return {id, uri: destination, name: fileName || `${id}.${extension}`, type: type || 'image/jpeg'};
}

export async function readQueue(userId: number): Promise<QueuedReport[]> {
  return readSecureJson<QueuedReport[]>(queueKey(userId), []);
}

export async function writeQueue(userId: number, reports: QueuedReport[]): Promise<void> {
  await writeSecureJson(queueKey(userId), reports);
}

export async function readCache(userId: number): Promise<MobileCache | null> {
  return readSecureJson<MobileCache | null>(cacheKey(userId), null);
}

export async function writeCache(userId: number, value: MobileCache): Promise<void> {
  await writeSecureJson(cacheKey(userId), value);
}

export async function syncQueue(userId: number, token: string): Promise<QueuedReport[]> {
  const queue = await readQueue(userId);
  for (let index = 0; index < queue.length; index += 1) {
    const item = queue[index];
    try {
      if (!item.serverReportId) {
        const response = await apiRequest<{data: FieldReport}>('/farmers/me/reports', token, {
          method: 'POST',
          body: JSON.stringify({...item.body, clientSubmissionId: item.clientSubmissionId}),
        });
        item.serverReportId = response.data.id;
        item.lastError = undefined;
        await writeQueue(userId, queue);
      }
      if (item.photos.length > 0) {
        const uploadedPhotos = item.photos;
        await uploadPhotos(item.serverReportId!, token, item.photos);
        item.photos = [];
        await writeQueue(userId, queue);
        await Promise.all(uploadedPhotos.map(photo => deleteQueuedPhoto(photo)));
      }
      queue.splice(index, 1);
      index -= 1;
      await writeQueue(userId, queue);
    } catch (error) {
      item.lastError = error instanceof Error ? error.message : 'Sync will retry when the server is available.';
      await writeQueue(userId, queue);
      break;
    }
  }
  return queue;
}

export async function deleteQueuedPhoto(photo: QueuedPhoto): Promise<void> {
  if (await RNFS.exists(photo.uri)) {
    await RNFS.unlink(photo.uri).catch(() => undefined);
  }
}
