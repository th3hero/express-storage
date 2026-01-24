/**
 * Configuration Utilities Test Suite
 * 
 * Tests for config loading, validation, and environment handling.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadEnvironmentConfig,
  environmentToStorageConfig,
  validateStorageConfig,
  loadAndValidateConfig,
  resetDotenvInitialization,
} from '../src/utils/config.utils.js';
import type { StorageConfig } from '../src/types/storage.types.js';

// Helper to manage environment variables
function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const original: Record<string, string | undefined> = {};
  
  // Save and set
  for (const key of Object.keys(env)) {
    original[key] = process.env[key];
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }
  
  try {
    fn();
  } finally {
    // Restore
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  }
}

// ============================================================================
// POSITIVE TEST CASES
// ============================================================================

describe('Config Utilities - Positive Tests', () => {
  beforeEach(() => {
    resetDotenvInitialization();
  });

  describe('loadEnvironmentConfig', () => {
    it('should load FILE_DRIVER from environment', () => {
      withEnv({ FILE_DRIVER: 's3' }, () => {
        const config = loadEnvironmentConfig();
        expect(config.FILE_DRIVER).toBe('s3');
      });
    });

    it('should load all S3 configuration', () => {
      withEnv({
        FILE_DRIVER: 's3',
        BUCKET_NAME: 'my-bucket',
        AWS_REGION: 'us-east-1',
        AWS_ACCESS_KEY: 'AKIATEST',
        AWS_SECRET_KEY: 'secretkey',
      }, () => {
        const config = loadEnvironmentConfig();
        
        expect(config.FILE_DRIVER).toBe('s3');
        expect(config.BUCKET_NAME).toBe('my-bucket');
        expect(config.AWS_REGION).toBe('us-east-1');
        expect(config.AWS_ACCESS_KEY).toBe('AKIATEST');
        expect(config.AWS_SECRET_KEY).toBe('secretkey');
      });
    });

    it('should load all GCS configuration', () => {
      withEnv({
        FILE_DRIVER: 'gcs',
        BUCKET_NAME: 'my-gcs-bucket',
        GCS_PROJECT_ID: 'my-project',
        GCS_CREDENTIALS: '/path/to/credentials.json',
      }, () => {
        const config = loadEnvironmentConfig();
        
        expect(config.FILE_DRIVER).toBe('gcs');
        expect(config.BUCKET_NAME).toBe('my-gcs-bucket');
        expect(config.GCS_PROJECT_ID).toBe('my-project');
        expect(config.GCS_CREDENTIALS).toBe('/path/to/credentials.json');
      });
    });

    it('should load all Azure configuration', () => {
      withEnv({
        FILE_DRIVER: 'azure',
        AZURE_CONNECTION_STRING: 'DefaultEndpointsProtocol=https;AccountName=test',
        BUCKET_NAME: 'my-container',
      }, () => {
        const config = loadEnvironmentConfig();
        
        expect(config.FILE_DRIVER).toBe('azure');
        expect(config.AZURE_CONNECTION_STRING).toBe('DefaultEndpointsProtocol=https;AccountName=test');
        expect(config.BUCKET_NAME).toBe('my-container');
      });
    });

    it('should load local storage configuration', () => {
      withEnv({
        FILE_DRIVER: 'local',
        LOCAL_PATH: 'custom/uploads',
      }, () => {
        const config = loadEnvironmentConfig();
        
        expect(config.FILE_DRIVER).toBe('local');
        expect(config.LOCAL_PATH).toBe('custom/uploads');
      });
    });

    it('should load optional settings', () => {
      withEnv({
        FILE_DRIVER: 'local',
        BUCKET_PATH: 'subfolder',
        PRESIGNED_URL_EXPIRY: '3600',
        MAX_FILE_SIZE: '10485760',
      }, () => {
        const config = loadEnvironmentConfig();
        
        expect(config.BUCKET_PATH).toBe('subfolder');
        expect(config.PRESIGNED_URL_EXPIRY).toBe('3600');
        expect(config.MAX_FILE_SIZE).toBe('10485760');
      });
    });
  });

  describe('environmentToStorageConfig', () => {
    it('should convert environment config to storage config', () => {
      const envConfig = {
        FILE_DRIVER: 's3',
        BUCKET_NAME: 'test-bucket',
        AWS_REGION: 'us-west-2',
        AWS_ACCESS_KEY: 'key',
        AWS_SECRET_KEY: 'secret',
      };
      
      const config = environmentToStorageConfig(envConfig as any);
      
      expect(config.driver).toBe('s3');
      expect(config.bucketName).toBe('test-bucket');
      expect(config.awsRegion).toBe('us-west-2');
    });

    it('should parse integer values', () => {
      const envConfig = {
        FILE_DRIVER: 'local',
        PRESIGNED_URL_EXPIRY: '1800',
        MAX_FILE_SIZE: '52428800',
      };
      
      const config = environmentToStorageConfig(envConfig as any);
      
      expect(config.presignedUrlExpiry).toBe(1800);
      expect(config.maxFileSize).toBe(52428800);
    });

    it('should use defaults for missing optional values', () => {
      const envConfig = {
        FILE_DRIVER: 'local',
      };
      
      const config = environmentToStorageConfig(envConfig as any);
      
      expect(config.localPath).toBe('public/express-storage');
      expect(config.presignedUrlExpiry).toBe(600);
    });

    it('should handle empty bucket path', () => {
      const envConfig = {
        FILE_DRIVER: 'local',
        BUCKET_PATH: '',
      };
      
      const config = environmentToStorageConfig(envConfig as any);
      
      expect(config.bucketPath).toBe('');
    });
  });

  describe('validateStorageConfig', () => {
    it('should validate local storage config', () => {
      const config: StorageConfig = {
        driver: 'local',
        localPath: 'uploads',
      };
      
      const result = validateStorageConfig(config);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate S3 config with full credentials', () => {
      const config: StorageConfig = {
        driver: 's3',
        bucketName: 'my-bucket',
        awsRegion: 'us-east-1',
        awsAccessKey: 'AKIA...',
        awsSecretKey: 'secret',
      };
      
      const result = validateStorageConfig(config);
      
      expect(result.isValid).toBe(true);
    });

    it('should validate S3 config without credentials (IAM)', () => {
      const config: StorageConfig = {
        driver: 's3',
        bucketName: 'my-bucket',
        awsRegion: 'us-east-1',
        // No access/secret keys - using IAM role
      };
      
      const result = validateStorageConfig(config);
      
      expect(result.isValid).toBe(true);
    });

    it('should validate GCS config', () => {
      const config: StorageConfig = {
        driver: 'gcs',
        bucketName: 'my-bucket',
        gcsProjectId: 'my-project',
      };
      
      const result = validateStorageConfig(config);
      
      expect(result.isValid).toBe(true);
    });

    it('should validate Azure config with connection string', () => {
      const config: StorageConfig = {
        driver: 'azure',
        azureConnectionString: 'DefaultEndpointsProtocol=https;...',
        azureContainerName: 'container',
      };
      
      const result = validateStorageConfig(config);
      
      expect(result.isValid).toBe(true);
    });

    it('should validate Azure config with account name/key', () => {
      const config: StorageConfig = {
        driver: 'azure',
        azureAccountName: 'myaccount',
        azureAccountKey: 'mykey',
        azureContainerName: 'container',
      };
      
      const result = validateStorageConfig(config);
      
      expect(result.isValid).toBe(true);
    });

    it('should validate Azure config with Managed Identity', () => {
      const config: StorageConfig = {
        driver: 'azure',
        azureAccountName: 'myaccount',
        // No key - using Managed Identity
        azureContainerName: 'container',
      };
      
      const result = validateStorageConfig(config);
      
      expect(result.isValid).toBe(true);
    });

    it('should validate presigned drivers', () => {
      const s3Presigned: StorageConfig = {
        driver: 's3-presigned',
        bucketName: 'bucket',
        awsRegion: 'us-east-1',
      };
      
      const gcsPresigned: StorageConfig = {
        driver: 'gcs-presigned',
        bucketName: 'bucket',
        gcsProjectId: 'project',
      };
      
      expect(validateStorageConfig(s3Presigned).isValid).toBe(true);
      expect(validateStorageConfig(gcsPresigned).isValid).toBe(true);
    });

    it('should accept valid presignedUrlExpiry', () => {
      const config: StorageConfig = {
        driver: 'local',
        presignedUrlExpiry: 3600,
      };
      
      const result = validateStorageConfig(config);
      
      expect(result.isValid).toBe(true);
    });

    it('should accept max presignedUrlExpiry (7 days)', () => {
      const config: StorageConfig = {
        driver: 'local',
        presignedUrlExpiry: 604800,
      };
      
      const result = validateStorageConfig(config);
      
      expect(result.isValid).toBe(true);
    });

    it('should accept valid maxFileSize', () => {
      const config: StorageConfig = {
        driver: 'local',
        maxFileSize: 1073741824, // 1GB
      };
      
      const result = validateStorageConfig(config);
      
      expect(result.isValid).toBe(true);
    });

    it('should accept Azure with azureContainerName (set from BUCKET_NAME)', () => {
      const config: StorageConfig = {
        driver: 'azure',
        azureConnectionString: 'connection-string',
        azureContainerName: 'my-container', // Set from BUCKET_NAME via environmentToStorageConfig
      };
      
      const result = validateStorageConfig(config);
      
      expect(result.isValid).toBe(true);
    });
  });

  describe('loadAndValidateConfig', () => {
    it('should load and validate in one call', () => {
      withEnv({
        FILE_DRIVER: 'local',
        LOCAL_PATH: 'test-uploads',
      }, () => {
        resetDotenvInitialization();
        const { config, validation } = loadAndValidateConfig();
        
        expect(config.driver).toBe('local');
        expect(validation.isValid).toBe(true);
      });
    });
  });
});

// ============================================================================
// NEGATIVE TEST CASES
// ============================================================================

describe('Config Utilities - Negative Tests', () => {
  beforeEach(() => {
    resetDotenvInitialization();
  });

  describe('validateStorageConfig', () => {
    it('should reject missing driver', () => {
      const config = {} as StorageConfig;
      
      const result = validateStorageConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('FILE_DRIVER is required');
    });

    it('should reject invalid driver', () => {
      const config: StorageConfig = {
        driver: 'invalid' as any,
      };
      
      const result = validateStorageConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid FILE_DRIVER'))).toBe(true);
    });

    it('should reject S3 without bucket name', () => {
      const config: StorageConfig = {
        driver: 's3',
        awsRegion: 'us-east-1',
      };
      
      const result = validateStorageConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('BUCKET_NAME is required for S3');
    });

    it('should reject S3 without region', () => {
      const config: StorageConfig = {
        driver: 's3',
        bucketName: 'bucket',
      };
      
      const result = validateStorageConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('AWS_REGION is required for S3');
    });

    it('should reject GCS without bucket name', () => {
      const config: StorageConfig = {
        driver: 'gcs',
        gcsProjectId: 'project',
      };
      
      const result = validateStorageConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('BUCKET_NAME is required for GCS');
    });

    it('should reject GCS without project ID', () => {
      const config: StorageConfig = {
        driver: 'gcs',
        bucketName: 'bucket',
      };
      
      const result = validateStorageConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('GCS_PROJECT_ID is required for GCS');
    });

    it('should reject Azure without any authentication', () => {
      const config: StorageConfig = {
        driver: 'azure',
        azureContainerName: 'container',
        // No connection string, no account name/key
      };
      
      const result = validateStorageConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Azure requires'))).toBe(true);
    });

    it('should reject Azure without container name', () => {
      const config: StorageConfig = {
        driver: 'azure',
        azureConnectionString: 'connection-string',
        // No container name or bucket name
      };
      
      const result = validateStorageConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('BUCKET_NAME is required for Azure'))).toBe(true);
    });

    it('should reject Azure presigned with Managed Identity only', () => {
      const config: StorageConfig = {
        driver: 'azure-presigned',
        azureAccountName: 'myaccount',
        // No key - Managed Identity can't generate SAS URLs
        azureContainerName: 'container',
      };
      
      const result = validateStorageConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Managed Identity cannot generate SAS URLs'))).toBe(true);
    });

    it('should reject negative presignedUrlExpiry', () => {
      const config: StorageConfig = {
        driver: 'local',
        presignedUrlExpiry: -100,
      };
      
      const result = validateStorageConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('positive number'))).toBe(true);
    });

    it('should reject zero presignedUrlExpiry', () => {
      const config: StorageConfig = {
        driver: 'local',
        presignedUrlExpiry: 0,
      };
      
      const result = validateStorageConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('positive number'))).toBe(true);
    });

    it('should reject presignedUrlExpiry over 7 days', () => {
      const config: StorageConfig = {
        driver: 'local',
        presignedUrlExpiry: 604801, // 7 days + 1 second
      };
      
      const result = validateStorageConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('cannot exceed'))).toBe(true);
    });

    it('should reject negative maxFileSize', () => {
      const config: StorageConfig = {
        driver: 'local',
        maxFileSize: -1,
      };
      
      const result = validateStorageConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('positive number'))).toBe(true);
    });

    it('should reject zero maxFileSize', () => {
      const config: StorageConfig = {
        driver: 'local',
        maxFileSize: 0,
      };
      
      const result = validateStorageConfig(config);
      
      expect(result.isValid).toBe(false);
    });

    it('should reject maxFileSize over 5TB', () => {
      const config: StorageConfig = {
        driver: 'local',
        maxFileSize: 5 * 1024 * 1024 * 1024 * 1024 + 1,
      };
      
      const result = validateStorageConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('5TB'))).toBe(true);
    });

    it('should reject NaN presignedUrlExpiry', () => {
      const config: StorageConfig = {
        driver: 'local',
        presignedUrlExpiry: NaN,
      };
      
      const result = validateStorageConfig(config);
      
      expect(result.isValid).toBe(false);
    });

    it('should reject NaN maxFileSize', () => {
      const config: StorageConfig = {
        driver: 'local',
        maxFileSize: NaN,
      };
      
      const result = validateStorageConfig(config);
      
      expect(result.isValid).toBe(false);
    });

    it('should collect multiple errors', () => {
      const config: StorageConfig = {
        driver: 's3',
        // Missing bucket name and region
        presignedUrlExpiry: -1,
        maxFileSize: -1,
      };
      
      const result = validateStorageConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(2);
    });
  });

  describe('environmentToStorageConfig', () => {
    it('should handle invalid integer strings gracefully', () => {
      const envConfig = {
        FILE_DRIVER: 'local',
        PRESIGNED_URL_EXPIRY: 'not-a-number',
        MAX_FILE_SIZE: 'abc123',
      };
      
      const config = environmentToStorageConfig(envConfig as any);
      
      // Should use defaults
      expect(config.presignedUrlExpiry).toBe(600);
      expect(config.maxFileSize).toBeUndefined();
    });

    it('should handle trailing characters in numbers', () => {
      const envConfig = {
        FILE_DRIVER: 'local',
        PRESIGNED_URL_EXPIRY: '100abc',
      };
      
      const config = environmentToStorageConfig(envConfig as any);
      
      // Should use default due to trailing chars
      expect(config.presignedUrlExpiry).toBe(600);
    });
  });
});

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

describe('Config Utilities - Edge Cases', () => {
  beforeEach(() => {
    resetDotenvInitialization();
  });

  describe('validateStorageConfig', () => {
    it('should handle empty string driver', () => {
      const config: StorageConfig = {
        driver: '' as any,
      };
      
      const result = validateStorageConfig(config);
      
      expect(result.isValid).toBe(false);
    });

    it('should handle whitespace-only values', () => {
      const config: StorageConfig = {
        driver: 's3',
        bucketName: '   ',
        awsRegion: '   ',
      };
      
      // Whitespace strings are truthy but invalid
      const result = validateStorageConfig(config);
      
      // The validation passes because whitespace strings are truthy
      // This is intentional - actual AWS calls will fail if values are invalid
      expect(result.isValid).toBe(true);
    });

    it('should validate all presigned driver variants', () => {
      const drivers = ['s3-presigned', 'gcs-presigned', 'azure-presigned'];
      
      for (const driver of drivers) {
        const config: StorageConfig = {
          driver: driver as any,
        };
        
        const result = validateStorageConfig(config);
        
        // Should have errors for missing credentials
        expect(result.isValid).toBe(false);
      }
    });
  });

  describe('environmentToStorageConfig', () => {
    it('should handle empty environment config', () => {
      const envConfig = {
        FILE_DRIVER: '',
      };
      
      const config = environmentToStorageConfig(envConfig as any);
      
      expect(config.driver).toBe('');
    });

    it('should preserve undefined for optional fields', () => {
      const envConfig = {
        FILE_DRIVER: 'local',
      };
      
      const config = environmentToStorageConfig(envConfig as any);
      
      expect(config.bucketName).toBeUndefined();
      expect(config.awsAccessKey).toBeUndefined();
    });

    it('should handle numeric strings with whitespace', () => {
      const envConfig = {
        FILE_DRIVER: 'local',
        PRESIGNED_URL_EXPIRY: '  1000  ',
      };
      
      const config = environmentToStorageConfig(envConfig as any);
      
      expect(config.presignedUrlExpiry).toBe(1000);
    });

    it('should handle negative numeric strings', () => {
      const envConfig = {
        FILE_DRIVER: 'local',
        PRESIGNED_URL_EXPIRY: '-500',
      };
      
      const config = environmentToStorageConfig(envConfig as any);
      
      expect(config.presignedUrlExpiry).toBe(-500);
      // Validation will catch this later
    });
  });
});
