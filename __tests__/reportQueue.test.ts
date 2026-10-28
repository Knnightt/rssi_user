import {apiRequest, uploadPhoto} from '../src/api';
import {QueuedReport, readQueue, syncQueue, writeQueue} from '../src/reportQueue';

jest.mock('../src/api', () => ({
  apiRequest: jest.fn(),
  uploadPhoto: jest.fn(),
}));

jest.mock('../src/secureStorage', () => {
  const values = new Map<string, string>();
  return {
    readSecureJson: jest.fn(async (key: string, fallback: unknown) => {
      const value = values.get(key);
      return value ? JSON.parse(value) : fallback;
    }),
    writeSecureJson: jest.fn(async (key: string, value: unknown) => {
      values.set(key, JSON.stringify(value));
    }),
    resetForTest: () => values.clear(),
  };
});

jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: {
    DocumentDirectoryPath: '/tmp',
    exists: jest.fn(async () => false),
    unlink: jest.fn(async () => undefined),
    copyFile: jest.fn(async () => undefined),
  },
}));

const apiRequestMock = jest.mocked(apiRequest);
const uploadPhotoMock = jest.mocked(uploadPhoto);
const secureStorageMock = jest.requireMock('../src/secureStorage') as {
  resetForTest: () => void;
};

function queuedReport(overrides: Partial<QueuedReport> = {}): QueuedReport {
  return {
    clientSubmissionId: 'client-submission-9f12',
    body: {observations: 'Leaf damage'},
    propertyName: 'Sample Farm',
    propertyProvince: 'Negros Oriental',
    propertyMunicipality: 'Pamplona',
    photos: [],
    createdAt: '2026-10-27T08:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  secureStorageMock.resetForTest();
});

test('a retry sends the same submission id after an uncertain report request', async () => {
  const queued = queuedReport();
  await writeQueue(5, [queued]);
  apiRequestMock
    .mockRejectedValueOnce(new Error('Server connection lost'))
    .mockResolvedValueOnce({data: {id: 81}} as never);

  const firstAttempt = await syncQueue(5, 'farmer-token');
  expect(firstAttempt).toHaveLength(1);
  expect(firstAttempt[0].lastError).toBe('Server connection lost');

  const secondAttempt = await syncQueue(5, 'farmer-token');
  expect(secondAttempt).toEqual([]);
  expect(apiRequestMock).toHaveBeenCalledTimes(2);
  for (const [, , options] of apiRequestMock.mock.calls) {
    expect(JSON.parse(String(options?.body))).toMatchObject({
      observations: 'Leaf damage',
      clientSubmissionId: queued.clientSubmissionId,
    });
  }
  expect(await readQueue(5)).toEqual([]);
});

test('a failed photo upload retries against the saved report without resubmitting the report', async () => {
  const photo = {
    id: 'photo-duplicate-safe-1',
    uri: '/tmp/rssi-photo.jpg',
    name: 'leaf.jpg',
    type: 'image/jpeg',
  };
  await writeQueue(5, [queuedReport({serverReportId: 81, photos: [photo]})]);
  uploadPhotoMock
    .mockRejectedValueOnce(new Error('Upload interrupted'))
    .mockResolvedValueOnce(undefined);

  const firstAttempt = await syncQueue(5, 'farmer-token');
  expect(firstAttempt).toHaveLength(1);
  expect(firstAttempt[0].serverReportId).toBe(81);
  expect(firstAttempt[0].photos[0].lastError).toBe('Upload interrupted');

  const secondAttempt = await syncQueue(5, 'farmer-token');
  expect(secondAttempt).toEqual([]);
  expect(apiRequestMock).not.toHaveBeenCalled();
  expect(uploadPhotoMock).toHaveBeenCalledTimes(2);
  expect(uploadPhotoMock.mock.calls.map(call => [call[0], call[2].id])).toEqual([
    [81, photo.id],
    [81, photo.id],
  ]);
});
