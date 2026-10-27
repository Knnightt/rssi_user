import RNFS from 'react-native-fs';
import {apiRequest, AuthResponse, FarmProperty, FieldReport, uploadPhoto} from './api';
import {readSecureJson, writeSecureJson} from './secureStorage';

export type QueuedPhoto = {
  id: string;
  uri: string;
  name: string;
  type: string;
  lastError?: string;
};

export type QueuedReport = {
  clientSubmissionId: string;
  body: Record<string, unknown>;
  propertyName: string;
  propertyProvince: string;
  propertyMunicipality: string;
  photos: QueuedPhoto[];
  photoCount?: number;
  syncedPhotoCount?: number;
  serverReportId?: number;
  createdAt: string;
  lastError?: string;
};

export type PhotoUploadProgress = {
  clientSubmissionId: string;
  photoId: string;
  percent: number | null;
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

export async function syncQueue(
  userId: number,
  token: string,
  onPhotoProgress?: (progress: PhotoUploadProgress | null) => void,
  onQueueChange?: (queue: QueuedReport[]) => void,
): Promise<QueuedReport[]> {
  const queue = await readQueue(userId);
  const publishQueue = () => onQueueChange?.(queue.map(item => ({
    ...item,
    body: {...item.body},
    photos: item.photos.map(photo => ({...photo})),
  })));
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
        publishQueue();
      }
    } catch (error) {
      item.lastError = error instanceof Error ? error.message : 'Sync will retry when the server is available.';
      await writeQueue(userId, queue);
      publishQueue();
      break;
    }

    item.photoCount ??= item.photos.length + (item.syncedPhotoCount ?? 0);
    item.syncedPhotoCount ??= 0;
    item.lastError = undefined;
    for (const photo of [...item.photos]) {
      onPhotoProgress?.({clientSubmissionId: item.clientSubmissionId, photoId: photo.id, percent: 0});
      try {
        await uploadPhoto(item.serverReportId!, token, photo, percent => {
          onPhotoProgress?.({clientSubmissionId: item.clientSubmissionId, photoId: photo.id, percent});
        });
        item.photos = item.photos.filter(candidate => candidate.id !== photo.id);
        item.syncedPhotoCount += 1;
        photo.lastError = undefined;
        await writeQueue(userId, queue);
        publishQueue();
        await deleteQueuedPhoto(photo);
      } catch (error) {
        // Keep a failed photo in the outbox so it can be retried independently.
        if (!item.photos.some(candidate => candidate.id === photo.id)) {
          item.photos.push(photo);
          item.syncedPhotoCount = Math.max(0, item.syncedPhotoCount - 1);
        }
        photo.lastError = error instanceof Error ? error.message : 'Photo upload failed. Retry when the server is available.';
        await writeQueue(userId, queue);
        publishQueue();
      } finally {
        onPhotoProgress?.(null);
      }
    }

    if (item.photos.length === 0) {
      queue.splice(index, 1);
      index -= 1;
      await writeQueue(userId, queue);
      publishQueue();
    }
  }
  return queue;
}

export async function retryQueuedPhoto(
  userId: number,
  token: string,
  clientSubmissionId: string,
  photoId: string,
  onPhotoProgress?: (progress: PhotoUploadProgress | null) => void,
): Promise<QueuedReport[]> {
  const queue = await readQueue(userId);
  const item = queue.find(report => report.clientSubmissionId === clientSubmissionId);
  if (!item?.serverReportId) {
    throw new Error('The report must sync before its photos can be retried.');
  }
  const photo = item.photos.find(candidate => candidate.id === photoId);
  if (!photo) {
    return queue;
  }

  const queueIndex = queue.indexOf(item);
  const photoIndex = item.photos.indexOf(photo);
  const previousPhotoCount = item.photoCount;
  const previousSyncedPhotoCount = item.syncedPhotoCount;
  onPhotoProgress?.({clientSubmissionId, photoId, percent: 0});
  try {
    await uploadPhoto(item.serverReportId, token, photo, percent => {
      onPhotoProgress?.({clientSubmissionId, photoId, percent});
    });
    item.photoCount ??= item.photos.length + (item.syncedPhotoCount ?? 0);
    item.syncedPhotoCount = (item.syncedPhotoCount ?? 0) + 1;
    item.photos = item.photos.filter(candidate => candidate.id !== photoId);
    photo.lastError = undefined;
    if (item.photos.length === 0) {
      const index = queue.indexOf(item);
      if (index >= 0) queue.splice(index, 1);
    }
    await writeQueue(userId, queue);
    await deleteQueuedPhoto(photo);
    return queue;
  } catch (error) {
    // If the upload or local persistence fails, keep the photo retryable. The
    // server endpoint is idempotent by photo id, so a retry is safe even when
    // the server accepted the upload but local storage did not save its result.
    if (!item.photos.some(candidate => candidate.id === photoId)) {
      item.photos.splice(Math.min(photoIndex, item.photos.length), 0, photo);
    }
    if (!queue.includes(item)) {
      queue.splice(Math.min(queueIndex, queue.length), 0, item);
    }
    item.photoCount = previousPhotoCount;
    item.syncedPhotoCount = previousSyncedPhotoCount;
    photo.lastError = error instanceof Error ? error.message : 'Photo upload failed. Retry when the server is available.';
    await writeQueue(userId, queue);
    throw error;
  } finally {
    onPhotoProgress?.(null);
  }
}

export async function deleteQueuedPhoto(photo: QueuedPhoto): Promise<void> {
  if (await RNFS.exists(photo.uri)) {
    await RNFS.unlink(photo.uri).catch(() => undefined);
  }
}
