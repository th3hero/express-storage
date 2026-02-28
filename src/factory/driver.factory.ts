import crypto from 'crypto';
import { StorageConfig, IStorageDriver } from '../types/storage.types.js';
import { LocalStorageDriver } from '../drivers/local.driver.js';
import { S3StorageDriver } from '../drivers/s3.driver.js';
import { GCSStorageDriver } from '../drivers/gcs.driver.js';
import { AzureStorageDriver } from '../drivers/azure.driver.js';

/**
 * Creates a driver instance for the given configuration (no caching).
 * 
 * Presigned variants (e.g., 's3-presigned') map to the same driver class
 * as their direct counterparts — the base class detects presigned mode
 * from the driver string and adjusts upload() behavior accordingly.
 */
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

/**
 * Returns a list of all supported driver type strings.
 */
export function getAvailableDrivers(): string[] {
  return [
    'local',
    's3',
    's3-presigned',
    'gcs',
    'gcs-presigned',
    'azure',
    'azure-presigned'
  ];
}

/**
 * StorageDriverFactory - Simple driver cache for reusing SDK client connections.
 * 
 * Each instance maintains its own private Map of driver instances keyed by
 * a SHA-256 hash of the config. Use this when you want multiple components
 * to share the same driver instance for a given configuration.
 * 
 * StorageManager does NOT use this — each manager creates its own driver
 * via `createDriver()`, ensuring full isolation. The factory exists for
 * advanced use cases like multi-tenant driver pools.
 * 
 * @example
 * const factory = new StorageDriverFactory();
 * const driver1 = factory.getOrCreate(config); // creates new
 * const driver2 = factory.getOrCreate(config); // returns cached
 */
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

  /**
   * Destroys all cached drivers and clears the cache.
   * Always call this instead of letting the factory be garbage-collected,
   * otherwise cloud SDK connections may leak.
   */
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
