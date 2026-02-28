/**
 * Driver Factory Test Suite
 * 
 * Tests for createDriver(), getAvailableDrivers(), and StorageDriverFactory caching.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StorageDriverFactory, createDriver, getAvailableDrivers } from '../src/factory/driver.factory.js';
import type { StorageConfig } from '../src/types/storage.types.js';

// ============================================================================
// createDriver() — stateless driver creation
// ============================================================================

describe('createDriver', () => {
  it('should create local driver', () => {
    expect(createDriver({ driver: 'local', localPath: 'test-uploads' })).toBeDefined();
  });

  it('should create S3 driver', () => {
    expect(createDriver({ driver: 's3', bucketName: 'bucket', awsRegion: 'us-east-1' })).toBeDefined();
  });

  it('should create S3 presigned driver', () => {
    expect(createDriver({ driver: 's3-presigned', bucketName: 'bucket', awsRegion: 'us-east-1' })).toBeDefined();
  });

  it('should create GCS driver', () => {
    expect(createDriver({ driver: 'gcs', bucketName: 'bucket', gcsProjectId: 'project' })).toBeDefined();
  });

  it('should create GCS presigned driver', () => {
    expect(createDriver({ driver: 'gcs-presigned', bucketName: 'bucket', gcsProjectId: 'project' })).toBeDefined();
  });

  it('should create Azure driver', () => {
    expect(createDriver({
      driver: 'azure',
      azureConnectionString: 'DefaultEndpointsProtocol=https;AccountName=test;AccountKey=test==;EndpointSuffix=core.windows.net',
      azureContainerName: 'container',
    })).toBeDefined();
  });

  it('should create Azure presigned driver', () => {
    expect(createDriver({
      driver: 'azure-presigned',
      azureAccountName: 'test',
      azureAccountKey: 'testkey==',
      azureContainerName: 'container',
    })).toBeDefined();
  });

  it('should throw for unsupported driver', () => {
    expect(() => createDriver({ driver: 'unsupported' as any })).toThrow('Unsupported storage driver');
  });

  it('should throw for empty driver', () => {
    expect(() => createDriver({ driver: '' as any })).toThrow('Unsupported storage driver');
  });
});

// ============================================================================
// getAvailableDrivers()
// ============================================================================

describe('getAvailableDrivers', () => {
  it('should return all 7 driver types', () => {
    const drivers = getAvailableDrivers();
    expect(drivers).toContain('local');
    expect(drivers).toContain('s3');
    expect(drivers).toContain('s3-presigned');
    expect(drivers).toContain('gcs');
    expect(drivers).toContain('gcs-presigned');
    expect(drivers).toContain('azure');
    expect(drivers).toContain('azure-presigned');
    expect(drivers.length).toBe(7);
  });

  it('should match static method on factory class', () => {
    expect(StorageDriverFactory.getAvailableDrivers()).toEqual(getAvailableDrivers());
  });
});

// ============================================================================
// StorageDriverFactory — instance-based caching
// ============================================================================

describe('StorageDriverFactory', () => {
  let factory: StorageDriverFactory;

  beforeEach(() => {
    factory = new StorageDriverFactory();
  });

  describe('Caching', () => {
    it('should return same driver for same config', () => {
      const config: StorageConfig = { driver: 'local', localPath: 'test-uploads' };

      const driver1 = factory.getOrCreate(config);
      const driver2 = factory.getOrCreate(config);

      expect(driver1).toBe(driver2);
      expect(factory.getCacheSize()).toBe(1);
    });

    it('should create separate drivers for different configs', () => {
      const driver1 = factory.getOrCreate({ driver: 'local', localPath: 'a' });
      const driver2 = factory.getOrCreate({ driver: 'local', localPath: 'b' });

      expect(driver1).not.toBe(driver2);
      expect(factory.getCacheSize()).toBe(2);
    });

    it('should differentiate by driver type', () => {
      factory.getOrCreate({ driver: 'local', localPath: 'uploads' });
      factory.getOrCreate({ driver: 's3', bucketName: 'bucket', awsRegion: 'us-east-1' });

      expect(factory.getCacheSize()).toBe(2);
    });

    it('should differentiate by credentials', () => {
      factory.getOrCreate({ driver: 's3', bucketName: 'b', awsRegion: 'us-east-1', awsAccessKey: 'k1', awsSecretKey: 's1' });
      factory.getOrCreate({ driver: 's3', bucketName: 'b', awsRegion: 'us-east-1', awsAccessKey: 'k2', awsSecretKey: 's2' });

      expect(factory.getCacheSize()).toBe(2);
    });

    it('should clear cache', () => {
      factory.getOrCreate({ driver: 'local', localPath: 'test' });
      expect(factory.getCacheSize()).toBe(1);

      factory.clearCache();
      expect(factory.getCacheSize()).toBe(0);
    });
  });

  describe('Instance Isolation', () => {
    it('should not share cache between instances', () => {
      const factory1 = new StorageDriverFactory();
      const factory2 = new StorageDriverFactory();

      factory1.getOrCreate({ driver: 'local', localPath: 'test' });

      expect(factory1.getCacheSize()).toBe(1);
      expect(factory2.getCacheSize()).toBe(0);
    });

    it('should clear only own cache', () => {
      const factory1 = new StorageDriverFactory();
      const factory2 = new StorageDriverFactory();

      factory1.getOrCreate({ driver: 'local', localPath: 'a' });
      factory2.getOrCreate({ driver: 'local', localPath: 'b' });

      factory1.clearCache();

      expect(factory1.getCacheSize()).toBe(0);
      expect(factory2.getCacheSize()).toBe(1);
    });
  });
});
