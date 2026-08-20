import crypto from 'crypto';
import { StorageConfig, IStorageDriver } from '../types/storage.types.js';
import { STORAGE_DRIVERS } from '../constants.js';
import { LocalStorageDriver } from '../drivers/local.driver.js';
import { S3StorageDriver } from '../drivers/s3.driver.js';
import { GCSStorageDriver } from '../drivers/gcs.driver.js';
import { AzureStorageDriver } from '../drivers/azure.driver.js';

export function createDriver(config: StorageConfig): IStorageDriver {
  switch (config.driver) {
    case 'local':
      return new LocalStorageDriver(config);
    case 's3':
    case 's3-presigned':
      return new S3StorageDriver(config);
    case 'gcs':
    case 'gcs-presigned':
      return new GCSStorageDriver(config);
    case 'azure':
    case 'azure-presigned':
      return new AzureStorageDriver(config);
    default:
      throw new Error(`Unsupported storage driver: ${config.driver}`);
  }
}

export function getAvailableDrivers(): string[] {
  return [...STORAGE_DRIVERS];
}

export class StorageDriverFactory {
  private readonly drivers: Map<string, IStorageDriver> = new Map();

  private hashConfig(config: StorageConfig): string {
    return crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex');
  }

  getOrCreate(config: StorageConfig): IStorageDriver {
    const key = this.hashConfig(config);
    
    const existing = this.drivers.get(key);
    if (existing) return existing;
    
    const driver = createDriver(config);
    this.drivers.set(key, driver);
    return driver;
  }

  clearCache(): void {
    for (const driver of this.drivers.values()) {
      driver.destroy();
    }
    this.drivers.clear();
  }

  getCacheSize(): number {
    return this.drivers.size;
  }

  static getAvailableDrivers(): string[] {
    return getAvailableDrivers();
  }
}
