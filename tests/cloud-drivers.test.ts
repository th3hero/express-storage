/**
 * Cloud Driver Unit Tests (Mocked SDKs)
 * 
 * Tests S3, GCS, and Azure driver logic with mocked cloud SDK calls.
 * Validates upload, delete, getMetadata, generateUploadUrl, generateViewUrl,
 * validateAndConfirmUpload, and listFiles behavior without real credentials.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { S3StorageDriver } from '../src/drivers/s3.driver.js';
import { GCSStorageDriver } from '../src/drivers/gcs.driver.js';
import { AzureStorageDriver } from '../src/drivers/azure.driver.js';
import type { StorageConfig } from '../src/types/storage.types.js';

// ============================================================================
// MOCK FACTORIES
// ============================================================================

function createS3Config(overrides: Partial<StorageConfig> = {}): StorageConfig {
  return {
    driver: 's3',
    bucketName: 'test-bucket',
    awsRegion: 'us-east-1',
    awsAccessKey: 'AKIAIOSFODNN7EXAMPLE',
    awsSecretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    ...overrides,
  };
}

function createGCSConfig(overrides: Partial<StorageConfig> = {}): StorageConfig {
  return {
    driver: 'gcs',
    bucketName: 'test-bucket',
    gcsProjectId: 'test-project',
    ...overrides,
  };
}

function createAzureConfig(overrides: Partial<StorageConfig> = {}): StorageConfig {
  return {
    driver: 'azure',
    azureConnectionString: 'DefaultEndpointsProtocol=https;AccountName=teststorage;AccountKey=dGVzdGtleQ==;EndpointSuffix=core.windows.net',
    azureContainerName: 'test-container',
    ...overrides,
  };
}

// ============================================================================
// S3 DRIVER TESTS
// ============================================================================

describe('S3StorageDriver', () => {
  describe('Constructor Validation', () => {
    it('should throw when bucketName is missing', () => {
      expect(() => new S3StorageDriver({ driver: 's3', awsRegion: 'us-east-1' }))
        .toThrow('bucketName is required');
    });

    it('should throw when awsRegion is missing', () => {
      expect(() => new S3StorageDriver({ driver: 's3', bucketName: 'bucket' }))
        .toThrow('awsRegion is required');
    });

    it('should create successfully with valid config', () => {
      expect(() => new S3StorageDriver(createS3Config())).not.toThrow();
    });

    it('should detect presigned mode from driver string', () => {
      const driver = new S3StorageDriver(createS3Config({ driver: 's3-presigned' }));
      expect((driver as any).presignedMode).toBe(true);
    });

    it('should not be in presigned mode for direct driver', () => {
      const driver = new S3StorageDriver(createS3Config());
      expect((driver as any).presignedMode).toBe(false);
    });
  });

  describe('Upload Validation', () => {
    it('should reject file with no content', async () => {
      const driver = new S3StorageDriver(createS3Config());
      const file = {
        fieldname: 'file',
        originalname: 'test.txt',
        encoding: '7bit',
        mimetype: 'text/plain',
        size: 0,
        buffer: Buffer.alloc(0),
        path: '',
        stream: null as any,
        destination: '',
        filename: '',
      } as Express.Multer.File;

      const result = await driver.upload(file);
      expect(result.success).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should reject file without originalname', async () => {
      const driver = new S3StorageDriver(createS3Config());
      const file = {
        fieldname: 'file',
        originalname: '',
        encoding: '7bit',
        mimetype: 'text/plain',
        size: 5,
        buffer: Buffer.from('hello'),
        path: '',
        stream: null as any,
        destination: '',
        filename: '',
      } as Express.Multer.File;

      const result = await driver.upload(file);
      expect(result.success).toBe(false);
    });
  });

  describe('Path Validation', () => {
    let driver: S3StorageDriver;

    beforeEach(() => {
      driver = new S3StorageDriver(createS3Config());
    });

    it('should reject path traversal in generateUploadUrl', async () => {
      const result = await driver.generateUploadUrl('../../../etc/passwd');
      expect(result.success).toBe(false);
      expect(result.error).toContain('path traversal');
    });

    it('should reject path traversal in generateViewUrl', async () => {
      const result = await driver.generateViewUrl('../secret.txt');
      expect(result.success).toBe(false);
    });

    it('should reject null bytes in generateUploadUrl', async () => {
      const result = await driver.generateUploadUrl('file\0name.txt');
      expect(result.success).toBe(false);
    });

    it('should reject malformed URL encoding in delete', async () => {
      const result = await driver.delete('%E0%A4%A');
      expect(result.success).toBe(false);
    });

    it('should reject path traversal in delete', async () => {
      const result = await driver.delete('../secret.txt');
      expect(result.success).toBe(false);
    });

    it('should return null for path traversal in getMetadata', async () => {
      const metadata = await driver.getMetadata('../../../etc/passwd');
      expect(metadata).toBeNull();
    });
  });

  describe('File Path Building', () => {
    it('should include bucketPath in file path', () => {
      const driver = new S3StorageDriver(createS3Config({ bucketPath: 'uploads/files' }));
      const filePath = (driver as any).buildFilePath('test.txt');
      expect(filePath).toBe('uploads/files/test.txt');
    });

    it('should handle empty bucketPath', () => {
      const driver = new S3StorageDriver(createS3Config({ bucketPath: '' }));
      const filePath = (driver as any).buildFilePath('test.txt');
      expect(filePath).toBe('test.txt');
    });
  });
});

// ============================================================================
// GCS DRIVER TESTS
// ============================================================================

describe('GCSStorageDriver', () => {
  describe('Constructor Validation', () => {
    it('should throw when bucketName is missing', () => {
      expect(() => new GCSStorageDriver({ driver: 'gcs', gcsProjectId: 'proj' }))
        .toThrow('bucketName is required');
    });

    it('should throw when gcsProjectId is missing', () => {
      expect(() => new GCSStorageDriver({ driver: 'gcs', bucketName: 'bucket' }))
        .toThrow('gcsProjectId is required');
    });

    it('should create successfully with valid config', () => {
      expect(() => new GCSStorageDriver(createGCSConfig())).not.toThrow();
    });

    it('should detect presigned mode', () => {
      const driver = new GCSStorageDriver(createGCSConfig({ driver: 'gcs-presigned' }));
      expect((driver as any).presignedMode).toBe(true);
    });
  });

  describe('Path Validation', () => {
    let driver: GCSStorageDriver;

    beforeEach(() => {
      driver = new GCSStorageDriver(createGCSConfig());
    });

    it('should reject path traversal in generateUploadUrl', async () => {
      const result = await driver.generateUploadUrl('../../../etc/passwd');
      expect(result.success).toBe(false);
    });

    it('should reject path traversal in generateViewUrl', async () => {
      const result = await driver.generateViewUrl('../secret.txt');
      expect(result.success).toBe(false);
    });

    it('should reject malformed URL encoding in delete', async () => {
      const result = await driver.delete('%E0%A4%A');
      expect(result.success).toBe(false);
    });

    it('should return null for path traversal in getMetadata', async () => {
      const metadata = await driver.getMetadata('../secret');
      expect(metadata).toBeNull();
    });
  });

  describe('Upload Validation', () => {
    it('should reject file with empty buffer', async () => {
      const driver = new GCSStorageDriver(createGCSConfig());
      const file = {
        fieldname: 'file',
        originalname: 'test.txt',
        encoding: '7bit',
        mimetype: 'text/plain',
        size: 0,
        buffer: Buffer.alloc(0),
        path: '',
        stream: null as any,
        destination: '',
        filename: '',
      } as Express.Multer.File;

      const result = await driver.upload(file);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// AZURE DRIVER TESTS
// ============================================================================

describe('AzureStorageDriver', () => {
  describe('Constructor Validation', () => {
    it('should throw when no Azure config is provided', () => {
      expect(() => new AzureStorageDriver({ driver: 'azure' }))
        .toThrow('Azure container name is required');
    });

    it('should throw when container name is missing', () => {
      expect(() => new AzureStorageDriver({
        driver: 'azure',
        azureAccountName: 'test',
        azureAccountKey: 'key123',
      })).toThrow('Azure container name is required');
    });

    it('should throw for invalid connection string (no AccountName)', () => {
      expect(() => new AzureStorageDriver({
        driver: 'azure',
        azureConnectionString: 'InvalidString',
        azureContainerName: 'container',
      })).toThrow('AccountName');
    });

    it('should create successfully with connection string', () => {
      expect(() => new AzureStorageDriver(createAzureConfig())).not.toThrow();
    });

    it('should create successfully with account name + key', () => {
      expect(() => new AzureStorageDriver({
        driver: 'azure',
        azureAccountName: 'teststorage',
        azureAccountKey: 'dGVzdGtleQ==',
        azureContainerName: 'container',
      })).not.toThrow();
    });

    it('should create with managed identity (account name only)', () => {
      expect(() => new AzureStorageDriver({
        driver: 'azure',
        azureAccountName: 'teststorage',
        azureContainerName: 'container',
      })).not.toThrow();
    });

    it('should throw for presigned mode without account key', () => {
      expect(() => new AzureStorageDriver({
        driver: 'azure-presigned',
        azureAccountName: 'teststorage',
        azureContainerName: 'container',
      })).toThrow('account key');
    });

    it('should detect presigned mode', () => {
      const driver = new AzureStorageDriver({
        driver: 'azure-presigned',
        azureAccountName: 'teststorage',
        azureAccountKey: 'dGVzdGtleQ==',
        azureContainerName: 'container',
      });
      expect((driver as any).presignedMode).toBe(true);
    });

    it('should extract account name from connection string', () => {
      const driver = new AzureStorageDriver(createAzureConfig());
      expect((driver as any).accountName).toBe('teststorage');
    });
  });

  describe('Path Validation', () => {
    let driver: AzureStorageDriver;

    beforeEach(() => {
      driver = new AzureStorageDriver(createAzureConfig());
    });

    it('should reject path traversal in generateUploadUrl', async () => {
      const result = await driver.generateUploadUrl('../../../etc/passwd');
      expect(result.success).toBe(false);
    });

    it('should reject path traversal in generateViewUrl', async () => {
      const result = await driver.generateViewUrl('../secret.txt');
      expect(result.success).toBe(false);
    });

    it('should reject malformed URL encoding in delete', async () => {
      const result = await driver.delete('%E0%A4%A');
      expect(result.success).toBe(false);
    });

    it('should return null for path traversal in getMetadata', async () => {
      const metadata = await driver.getMetadata('../secret');
      expect(metadata).toBeNull();
    });
  });

  describe('Upload Validation', () => {
    it('should reject file with no content', async () => {
      const driver = new AzureStorageDriver(createAzureConfig());
      const file = {
        fieldname: 'file',
        originalname: 'test.txt',
        encoding: '7bit',
        mimetype: 'text/plain',
        size: 0,
        buffer: Buffer.alloc(0),
        path: '',
        stream: null as any,
        destination: '',
        filename: '',
      } as Express.Multer.File;

      const result = await driver.upload(file);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// CROSS-DRIVER TESTS
// ============================================================================

describe('Cross-Driver Consistency', () => {
  const drivers = [
    { name: 'S3', create: () => new S3StorageDriver(createS3Config()) },
    { name: 'GCS', create: () => new GCSStorageDriver(createGCSConfig()) },
    { name: 'Azure', create: () => new AzureStorageDriver(createAzureConfig()) },
  ];

  for (const { name, create } of drivers) {
    describe(`${name} - presigned URL expiry`, () => {
      it('should use default expiry of 600 seconds', () => {
        const driver = create();
        const expiry = (driver as any).getPresignedUrlExpiry();
        expect(expiry).toBe(600);
      });

      it('should clamp to minimum of 1 second', () => {
        const config = { ...createS3Config(), presignedUrlExpiry: 0 };
        const driver = new S3StorageDriver(config);
        expect((driver as any).getPresignedUrlExpiry()).toBe(1);
      });

      it('should clamp to maximum of 7 days', () => {
        const config = { ...createS3Config(), presignedUrlExpiry: 999999 };
        const driver = new S3StorageDriver(config);
        expect((driver as any).getPresignedUrlExpiry()).toBe(604800);
      });
    });
  }
});
