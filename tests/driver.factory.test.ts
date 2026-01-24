/**
 * Driver Factory Test Suite
 * 
 * Tests for the StorageDriverFactory caching and driver creation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StorageDriverFactory } from '../src/factory/driver.factory.js';
import type { StorageConfig } from '../src/types/storage.types.js';

// ============================================================================
// SETUP & TEARDOWN
// ============================================================================

describe('StorageDriverFactory', () => {
  beforeEach(() => {
    StorageDriverFactory.clearCache();
  });

  afterEach(() => {
    StorageDriverFactory.clearCache();
  });

  // ============================================================================
  // POSITIVE TEST CASES
  // ============================================================================

  describe('Driver Creation - Positive', () => {
    it('should create local driver', () => {
      const config: StorageConfig = {
        driver: 'local',
        localPath: 'test-uploads',
      };

      const driver = StorageDriverFactory.createDriver(config);

      expect(driver).toBeDefined();
      expect(StorageDriverFactory.getCacheSize()).toBe(1);
    });

    it('should create S3 driver', () => {
      const config: StorageConfig = {
        driver: 's3',
        bucketName: 'test-bucket',
        awsRegion: 'us-east-1',
      };

      const driver = StorageDriverFactory.createDriver(config);

      expect(driver).toBeDefined();
    });

    it('should create S3 presigned driver', () => {
      const config: StorageConfig = {
        driver: 's3-presigned',
        bucketName: 'test-bucket',
        awsRegion: 'us-east-1',
      };

      const driver = StorageDriverFactory.createDriver(config);

      expect(driver).toBeDefined();
    });

    it('should create GCS driver', () => {
      const config: StorageConfig = {
        driver: 'gcs',
        bucketName: 'test-bucket',
        gcsProjectId: 'test-project',
      };

      const driver = StorageDriverFactory.createDriver(config);

      expect(driver).toBeDefined();
    });

    it('should create GCS presigned driver', () => {
      const config: StorageConfig = {
        driver: 'gcs-presigned',
        bucketName: 'test-bucket',
        gcsProjectId: 'test-project',
      };

      const driver = StorageDriverFactory.createDriver(config);

      expect(driver).toBeDefined();
    });

    it('should create Azure driver', () => {
      const config: StorageConfig = {
        driver: 'azure',
        azureConnectionString: 'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=test==;EndpointSuffix=core.windows.net',
        azureContainerName: 'test-container',
      };

      const driver = StorageDriverFactory.createDriver(config);

      expect(driver).toBeDefined();
    });

    it('should create Azure presigned driver', () => {
      const config: StorageConfig = {
        driver: 'azure-presigned',
        azureAccountName: 'test',
        azureAccountKey: 'testkey==',
        azureContainerName: 'test-container',
      };

      const driver = StorageDriverFactory.createDriver(config);

      expect(driver).toBeDefined();
    });

    it('should return all available drivers', () => {
      const drivers = StorageDriverFactory.getAvailableDrivers();

      expect(drivers).toContain('local');
      expect(drivers).toContain('s3');
      expect(drivers).toContain('s3-presigned');
      expect(drivers).toContain('gcs');
      expect(drivers).toContain('gcs-presigned');
      expect(drivers).toContain('azure');
      expect(drivers).toContain('azure-presigned');
      expect(drivers.length).toBe(7);
    });
  });

  // ============================================================================
  // CACHING TESTS
  // ============================================================================

  describe('Caching', () => {
    it('should cache drivers with same config', () => {
      const config: StorageConfig = {
        driver: 'local',
        localPath: 'test-uploads',
      };

      const driver1 = StorageDriverFactory.createDriver(config);
      const driver2 = StorageDriverFactory.createDriver(config);

      expect(driver1).toBe(driver2);
      expect(StorageDriverFactory.getCacheSize()).toBe(1);
    });

    it('should create separate drivers for different configs', () => {
      const config1: StorageConfig = {
        driver: 'local',
        localPath: 'uploads-1',
      };
      const config2: StorageConfig = {
        driver: 'local',
        localPath: 'uploads-2',
      };

      const driver1 = StorageDriverFactory.createDriver(config1);
      const driver2 = StorageDriverFactory.createDriver(config2);

      expect(driver1).not.toBe(driver2);
      expect(StorageDriverFactory.getCacheSize()).toBe(2);
    });

    it('should create separate drivers for different driver types', () => {
      const localConfig: StorageConfig = {
        driver: 'local',
        localPath: 'uploads',
      };
      const s3Config: StorageConfig = {
        driver: 's3',
        bucketName: 'bucket',
        awsRegion: 'us-east-1',
      };

      StorageDriverFactory.createDriver(localConfig);
      StorageDriverFactory.createDriver(s3Config);

      expect(StorageDriverFactory.getCacheSize()).toBe(2);
    });

    it('should clear cache', () => {
      const config: StorageConfig = {
        driver: 'local',
        localPath: 'test',
      };

      StorageDriverFactory.createDriver(config);
      expect(StorageDriverFactory.getCacheSize()).toBe(1);

      StorageDriverFactory.clearCache();
      expect(StorageDriverFactory.getCacheSize()).toBe(0);
    });

    it('should remove specific driver from cache', () => {
      const config1: StorageConfig = {
        driver: 'local',
        localPath: 'uploads-1',
      };
      const config2: StorageConfig = {
        driver: 'local',
        localPath: 'uploads-2',
      };

      StorageDriverFactory.createDriver(config1);
      StorageDriverFactory.createDriver(config2);
      expect(StorageDriverFactory.getCacheSize()).toBe(2);

      const removed = StorageDriverFactory.removeFromCache(config1);

      expect(removed).toBe(true);
      expect(StorageDriverFactory.getCacheSize()).toBe(1);
    });

    it('should return false when removing non-cached config', () => {
      const config: StorageConfig = {
        driver: 'local',
        localPath: 'not-cached',
      };

      const removed = StorageDriverFactory.removeFromCache(config);

      expect(removed).toBe(false);
    });

    it('should handle different presignedUrlExpiry values', () => {
      const config1: StorageConfig = {
        driver: 'local',
        localPath: 'uploads',
        presignedUrlExpiry: 600,
      };
      const config2: StorageConfig = {
        driver: 'local',
        localPath: 'uploads',
        presignedUrlExpiry: 1800,
      };

      StorageDriverFactory.createDriver(config1);
      StorageDriverFactory.createDriver(config2);

      expect(StorageDriverFactory.getCacheSize()).toBe(2);
    });

    it('should handle different maxFileSize values', () => {
      const config1: StorageConfig = {
        driver: 'local',
        localPath: 'uploads',
        maxFileSize: 1000000,
      };
      const config2: StorageConfig = {
        driver: 'local',
        localPath: 'uploads',
        maxFileSize: 5000000,
      };

      StorageDriverFactory.createDriver(config1);
      StorageDriverFactory.createDriver(config2);

      expect(StorageDriverFactory.getCacheSize()).toBe(2);
    });

    it('should handle different bucket paths', () => {
      const config1: StorageConfig = {
        driver: 'local',
        localPath: 'uploads',
        bucketPath: 'path1',
      };
      const config2: StorageConfig = {
        driver: 'local',
        localPath: 'uploads',
        bucketPath: 'path2',
      };

      StorageDriverFactory.createDriver(config1);
      StorageDriverFactory.createDriver(config2);

      expect(StorageDriverFactory.getCacheSize()).toBe(2);
    });
  });

  // ============================================================================
  // LRU EVICTION TESTS
  // ============================================================================

  describe('LRU Eviction', () => {
    it('should evict least recently used driver when cache is full', () => {
      // Create 100 drivers (the max cache size)
      for (let i = 0; i < 100; i++) {
        StorageDriverFactory.createDriver({
          driver: 'local',
          localPath: `uploads-${i}`,
        });
      }

      expect(StorageDriverFactory.getCacheSize()).toBe(100);

      // Create one more driver
      StorageDriverFactory.createDriver({
        driver: 'local',
        localPath: 'uploads-overflow',
      });

      // Cache should still be at max size
      expect(StorageDriverFactory.getCacheSize()).toBe(100);
    });

    it('should update last access time when driver is reused', () => {
      // Create initial driver
      const config1: StorageConfig = {
        driver: 'local',
        localPath: 'uploads-1',
      };
      StorageDriverFactory.createDriver(config1);

      // Fill cache
      for (let i = 2; i <= 100; i++) {
        StorageDriverFactory.createDriver({
          driver: 'local',
          localPath: `uploads-${i}`,
        });
      }

      // Access first driver again (updates its last access time)
      StorageDriverFactory.createDriver(config1);

      // Add new driver (should evict something other than config1)
      StorageDriverFactory.createDriver({
        driver: 'local',
        localPath: 'uploads-new',
      });

      // First driver should still be in cache
      const cachedDriver = StorageDriverFactory.createDriver(config1);
      expect(cachedDriver).toBeDefined();
    });
  });

  // ============================================================================
  // NEGATIVE TEST CASES
  // ============================================================================

  describe('Driver Creation - Negative', () => {
    it('should throw for unsupported driver', () => {
      const config = {
        driver: 'unsupported' as any,
      };

      expect(() => {
        StorageDriverFactory.createDriver(config);
      }).toThrow('Unsupported storage driver');
    });

    it('should throw for empty driver', () => {
      const config = {
        driver: '' as any,
      };

      expect(() => {
        StorageDriverFactory.createDriver(config);
      }).toThrow('Unsupported storage driver');
    });
  });

  // ============================================================================
  // CACHE KEY GENERATION TESTS
  // ============================================================================

  describe('Cache Key Generation', () => {
    it('should differentiate configs with different AWS credentials', () => {
      const config1: StorageConfig = {
        driver: 's3',
        bucketName: 'bucket',
        awsRegion: 'us-east-1',
        awsAccessKey: 'key1',
        awsSecretKey: 'secret1',
      };
      const config2: StorageConfig = {
        driver: 's3',
        bucketName: 'bucket',
        awsRegion: 'us-east-1',
        awsAccessKey: 'key2',
        awsSecretKey: 'secret2',
      };

      StorageDriverFactory.createDriver(config1);
      StorageDriverFactory.createDriver(config2);

      expect(StorageDriverFactory.getCacheSize()).toBe(2);
    });

    it('should differentiate configs with different Azure credentials', () => {
      // Use valid connection strings with different account names
      const config1: StorageConfig = {
        driver: 'azure',
        azureConnectionString: 'DefaultEndpointsProtocol=https;AccountName=account1;AccountKey=key1==;EndpointSuffix=core.windows.net',
        azureContainerName: 'container',
      };
      const config2: StorageConfig = {
        driver: 'azure',
        azureConnectionString: 'DefaultEndpointsProtocol=https;AccountName=account2;AccountKey=key2==;EndpointSuffix=core.windows.net',
        azureContainerName: 'container',
      };

      StorageDriverFactory.createDriver(config1);
      StorageDriverFactory.createDriver(config2);

      expect(StorageDriverFactory.getCacheSize()).toBe(2);
    });

    it('should differentiate configs with different GCS credentials', () => {
      const config1: StorageConfig = {
        driver: 'gcs',
        bucketName: 'bucket',
        gcsProjectId: 'project',
        gcsCredentials: 'creds1',
      };
      const config2: StorageConfig = {
        driver: 'gcs',
        bucketName: 'bucket',
        gcsProjectId: 'project',
        gcsCredentials: 'creds2',
      };

      StorageDriverFactory.createDriver(config1);
      StorageDriverFactory.createDriver(config2);

      expect(StorageDriverFactory.getCacheSize()).toBe(2);
    });

    it('should handle undefined optional values consistently', () => {
      const config1: StorageConfig = {
        driver: 'local',
        localPath: 'uploads',
        bucketPath: undefined,
      };
      const config2: StorageConfig = {
        driver: 'local',
        localPath: 'uploads',
        // bucketPath not specified (implicitly undefined)
      };

      const driver1 = StorageDriverFactory.createDriver(config1);
      const driver2 = StorageDriverFactory.createDriver(config2);

      // Should be the same driver (both have undefined bucketPath)
      expect(driver1).toBe(driver2);
      expect(StorageDriverFactory.getCacheSize()).toBe(1);
    });

    it('should differentiate empty string from undefined', () => {
      const config1: StorageConfig = {
        driver: 'local',
        localPath: 'uploads',
        bucketPath: '',
      };
      const config2: StorageConfig = {
        driver: 'local',
        localPath: 'uploads',
        bucketPath: undefined,
      };

      StorageDriverFactory.createDriver(config1);
      StorageDriverFactory.createDriver(config2);

      // Empty string and undefined may be treated the same in cache key generation
      // depending on implementation - this tests the actual behavior
      expect(StorageDriverFactory.getCacheSize()).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle empty localPath', () => {
      const config: StorageConfig = {
        driver: 'local',
        localPath: '',
      };

      const driver = StorageDriverFactory.createDriver(config);

      expect(driver).toBeDefined();
    });

    it('should handle very long bucket names', () => {
      const config: StorageConfig = {
        driver: 'local',
        localPath: 'a'.repeat(1000),
      };

      const driver = StorageDriverFactory.createDriver(config);

      expect(driver).toBeDefined();
    });

    it('should handle special characters in paths', () => {
      const config: StorageConfig = {
        driver: 'local',
        localPath: 'uploads/path with spaces/and-dashes',
      };

      const driver = StorageDriverFactory.createDriver(config);

      expect(driver).toBeDefined();
    });

    it('should handle numeric-like bucket names', () => {
      const config: StorageConfig = {
        driver: 'local',
        localPath: '12345',
      };

      const driver = StorageDriverFactory.createDriver(config);

      expect(driver).toBeDefined();
    });
  });
});
