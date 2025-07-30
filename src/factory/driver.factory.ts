import { StorageConfig, IStorageDriver } from '../types/storage.types.js';
import { LocalStorageDriver } from '../drivers/local.driver.js';
import { S3StorageDriver, S3PresignedStorageDriver } from '../drivers/s3.driver.js';
import { GCSStorageDriver, GCSPresignedStorageDriver } from '../drivers/gcs.driver.js';
import { OCIStorageDriver, OCIPresignedStorageDriver } from '../drivers/oci.driver.js';

/**
 * Factory class for creating storage drivers
 */
export class StorageDriverFactory {
  private static drivers: Map<string, IStorageDriver> = new Map();

  /**
   * Create and return a storage driver based on configuration
   */
  static createDriver(config: StorageConfig): IStorageDriver {
    const driverKey = this.getDriverKey(config);
    
    // Return cached driver if exists
    if (this.drivers.has(driverKey)) {
      return this.drivers.get(driverKey)!;
    }
    
    // Create new driver
    const driver = this.createNewDriver(config);
    
    // Cache the driver
    this.drivers.set(driverKey, driver);
    
    return driver;
  }

  /**
   * Create a new driver instance
   */
  private static createNewDriver(config: StorageConfig): IStorageDriver {
    switch (config.driver) {
      case 'local':
        return new LocalStorageDriver(config);
        
      case 's3':
        return this.createS3Driver(config);
        
      case 's3-presigned':
        return this.createS3PresignedDriver(config);
        
      case 'gcs':
        return this.createGCSDriver(config);
        
      case 'gcs-presigned':
        return this.createGCSPresignedDriver(config);
        
      case 'oci':
        return this.createOCIDriver(config);
        
      case 'oci-presigned':
        return this.createOCIPresignedDriver(config);
        
      default:
        throw new Error(`Unsupported storage driver: ${config.driver}`);
    }
  }

  /**
   * Create S3 driver
   */
  private static createS3Driver(config: StorageConfig): IStorageDriver {
    return new S3StorageDriver(config);
  }

  /**
   * Create S3 presigned driver
   */
  private static createS3PresignedDriver(config: StorageConfig): IStorageDriver {
    return new S3PresignedStorageDriver(config);
  }

  /**
   * Create GCS driver
   */
  private static createGCSDriver(config: StorageConfig): IStorageDriver {
    return new GCSStorageDriver(config);
  }

  /**
   * Create GCS presigned driver
   */
  private static createGCSPresignedDriver(config: StorageConfig): IStorageDriver {
    return new GCSPresignedStorageDriver(config);
  }

  /**
   * Create OCI driver
   */
  private static createOCIDriver(config: StorageConfig): IStorageDriver {
    return new OCIStorageDriver(config);
  }

  /**
   * Create OCI presigned driver
   */
  private static createOCIPresignedDriver(config: StorageConfig): IStorageDriver {
    return new OCIPresignedStorageDriver(config);
  }

  /**
   * Generate unique key for driver caching
   */
  private static getDriverKey(config: StorageConfig): string {
    return `${config.driver}_${config.bucketName || 'local'}_${config.localPath || 'default'}`;
  }

  /**
   * Clear cached drivers
   */
  static clearCache(): void {
    this.drivers.clear();
  }

  /**
   * Get cached driver count
   */
  static getCachedDriverCount(): number {
    return this.drivers.size;
  }

  /**
   * Get available drivers
   */
  static getAvailableDrivers(): string[] {
    return [
      'local',
      's3',
      's3-presigned',
      'gcs',
      'gcs-presigned',
      'oci',
      'oci-presigned'
    ];
  }
} 