import type { StorageDriver } from './types/storage.types.js';

export const STORAGE_DRIVERS = [
  'local',
  's3',
  's3-presigned',
  'gcs',
  'gcs-presigned',
  'azure',
  'azure-presigned',
] as const satisfies readonly StorageDriver[];

export function isStorageDriver(value: string): value is StorageDriver {
  return (STORAGE_DRIVERS as readonly string[]).includes(value);
}

export const DEFAULT_PRESIGNED_URL_EXPIRY = 600;
export const MAX_PRESIGNED_URL_EXPIRY = 604800;
export const MIN_PRESIGNED_URL_EXPIRY = 1;
export const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024;
export const MAX_FILE_SIZE_LIMIT = 5 * 1024 * 1024 * 1024 * 1024;
export const STREAM_THRESHOLD = 100 * 1024 * 1024;
export const DEFAULT_LOCAL_PATH = 'public/express-storage';
export const DEFAULT_CONCURRENCY = 10;
export const LOCAL_META_SUFFIX = '.meta.json';
