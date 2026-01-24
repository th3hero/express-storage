import { StorageConfig, IStorageDriver } from '../types/storage.types.js';
import { LocalStorageDriver } from '../drivers/local.driver.js';
import { S3StorageDriver, S3PresignedStorageDriver } from '../drivers/s3.driver.js';
import { GCSStorageDriver, GCSPresignedStorageDriver } from '../drivers/gcs.driver.js';
import { AzureStorageDriver, AzurePresignedStorageDriver } from '../drivers/azure.driver.js';

const MAX_CACHED_DRIVERS = 100;

interface CacheEntry {
  driver: IStorageDriver;
  lastAccess: number;
}

/**
 * StorageDriverFactory - Creates and caches storage driver instances.
 * 
 * Drivers are cached to avoid recreating connections for the same configuration.
 * The cache is limited to 100 drivers to prevent memory issues in long-running apps.
 * 
 * When the cache is full, the least recently used driver gets evicted.
 */
export class StorageDriverFactory {
  private static drivers: Map<string, CacheEntry> = new Map();

  /**
   * Gets or creates a driver for the given configuration.
   * 
   * If a driver for this exact configuration already exists, it's reused.
   * Otherwise, a new driver is created and cached.
   */
  static createDriver(config: StorageConfig): IStorageDriver {
    const driverKey = this.getDriverKey(config);
    
    const existing = this.drivers.get(driverKey);
    if (existing) {
      existing.lastAccess = Date.now();
      return existing.driver;
    }
    
    if (this.drivers.size >= MAX_CACHED_DRIVERS) {
      this.evictLRU();
    }
    
    const driver = this.createNewDriver(config);
    
    this.drivers.set(driverKey, {
      driver,
      lastAccess: Date.now(),
    });
    
    return driver;
  }

  /**
   * Removes the oldest (least recently accessed) driver from the cache.
   */
  private static evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    
    for (const [key, entry] of this.drivers.entries()) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.drivers.delete(oldestKey);
    }
  }

  /**
   * Creates a new driver instance based on the config's driver type.
   */
  private static createNewDriver(config: StorageConfig): IStorageDriver {
    switch (config.driver) {
      case 'local':
        return new LocalStorageDriver(config);
      case 's3':
        return new S3StorageDriver(config);
      case 's3-presigned':
        return new S3PresignedStorageDriver(config);
      case 'gcs':
        return new GCSStorageDriver(config);
      case 'gcs-presigned':
        return new GCSPresignedStorageDriver(config);
      case 'azure':
        return new AzureStorageDriver(config);
      case 'azure-presigned':
        return new AzurePresignedStorageDriver(config);
      default:
        throw new Error(`Unsupported storage driver: ${config.driver}`);
    }
  }

  /**
   * Creates a fingerprint of a string for cache key comparison.
   * Uses triple hash approach (length + two FNV-1a hashes + checksum) for maximum collision resistance.
   * 
   * The triple hash approach with length and checksum significantly reduces collision probability:
   * - Single 32-bit hash: ~77k items for 50% collision probability
   * - This approach: effectively ~128+ bits of entropy, negligible collision probability
   * 
   * For credentials, we also include a prefix checksum to detect similar keys early.
   */
  private static secureHash(str: string): string {
    if (!str) return '0:0:0:0';
    
    const length = str.length;
    
    // First hash with standard FNV-1a offset basis
    const FNV_OFFSET_BASIS_1 = 2166136261;
    const FNV_PRIME = 16777619;
    
    let hash1 = FNV_OFFSET_BASIS_1;
    for (let i = 0; i < str.length; i++) {
      hash1 ^= str.charCodeAt(i);
      hash1 = Math.imul(hash1, FNV_PRIME);
    }
    
    // Second hash with different seed (XOR first hash into offset basis)
    // This creates a completely different hash even for similar strings
    const FNV_OFFSET_BASIS_2 = 0x811c9dc5 ^ (hash1 >>> 0);
    let hash2 = FNV_OFFSET_BASIS_2;
    for (let i = str.length - 1; i >= 0; i--) { // Reverse direction for different bit mixing
      hash2 ^= str.charCodeAt(i);
      hash2 = Math.imul(hash2, FNV_PRIME);
    }
    
    // Third component: simple additive checksum of character codes
    // Provides additional collision resistance with minimal computation
    let checksum = 0;
    for (let i = 0; i < str.length; i++) {
      checksum = (checksum + str.charCodeAt(i) * (i + 1)) >>> 0;
    }
    
    // Return length:hash1:hash2:checksum format - collision requires matching all four
    return `${length}:${(hash1 >>> 0).toString(16)}:${(hash2 >>> 0).toString(16)}:${(checksum >>> 0).toString(16)}`;
  }

  /**
   * Generates a unique cache key for a configuration.
   * Includes all properties that affect driver behavior.
   */
  private static getDriverKey(config: StorageConfig): string {
    const keyParts = [
      config.driver,
      config.bucketName || 'local',
      config.localPath || 'default',
      config.bucketPath || '',
      (config.presignedUrlExpiry || 600).toString(),
      (config.maxFileSize || 5368709120).toString(),
      config.awsRegion || '',
      this.secureHash(config.awsAccessKey || ''),
      this.secureHash(config.awsSecretKey || ''),
      config.gcsProjectId || '',
      this.secureHash(config.gcsCredentials || ''),
      config.azureAccountName || '',
      config.azureContainerName || '',
      this.secureHash(config.azureConnectionString || ''),
      this.secureHash(config.azureAccountKey || ''),
    ];
    
    return keyParts.join('_');
  }

  /**
   * Clears all cached drivers.
   * Useful in tests or when you've rotated credentials.
   */
  static clearCache(): void {
    this.drivers.clear();
  }

  /**
   * Returns the number of cached drivers.
   */
  static getCacheSize(): number {
    return this.drivers.size;
  }

  /**
   * Removes a specific driver from the cache.
   * Useful when credentials have changed for a specific configuration.
   */
  static removeFromCache(config: StorageConfig): boolean {
    const driverKey = this.getDriverKey(config);
    return this.drivers.delete(driverKey);
  }

  /**
   * Returns a list of all supported driver types.
   */
  static getAvailableDrivers(): string[] {
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
}
