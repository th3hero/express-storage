import dotenv from 'dotenv';
import { StorageConfig, EnvironmentConfig, ValidationResult } from '../types/storage.types.js';

let dotenvInitialized = false;

/**
 * Loads your .env file if it hasn't been loaded already.
 * Safe to call multiple times — it only runs once.
 */
export function initializeDotenv(): void {
  if (!dotenvInitialized) {
    dotenv.config();
    dotenvInitialized = true;
  }
}

const ENV_KEYS = {
  FILE_DRIVER: 'FILE_DRIVER',
  BUCKET_NAME: 'BUCKET_NAME',
  BUCKET_PATH: 'BUCKET_PATH',
  LOCAL_PATH: 'LOCAL_PATH',
  PRESIGNED_URL_EXPIRY: 'PRESIGNED_URL_EXPIRY',
  MAX_FILE_SIZE: 'MAX_FILE_SIZE',
  
  AWS_REGION: 'AWS_REGION',
  AWS_ACCESS_KEY: 'AWS_ACCESS_KEY',
  AWS_SECRET_KEY: 'AWS_SECRET_KEY',
  
  GCS_PROJECT_ID: 'GCS_PROJECT_ID',
  GCS_CREDENTIALS: 'GCS_CREDENTIALS',
  
  AZURE_CONNECTION_STRING: 'AZURE_CONNECTION_STRING',
  AZURE_ACCOUNT_NAME: 'AZURE_ACCOUNT_NAME',
  AZURE_ACCOUNT_KEY: 'AZURE_ACCOUNT_KEY',
  AZURE_CONTAINER_NAME: 'AZURE_CONTAINER_NAME',
} as const;

const DEFAULT_CONFIG: Partial<StorageConfig> = {
  presignedUrlExpiry: 600,
  localPath: 'public/express-storage',
};

/**
 * Reads storage configuration from environment variables.
 * Automatically loads .env on first call.
 */
export function loadEnvironmentConfig(): EnvironmentConfig {
  initializeDotenv();
  
  return {
    FILE_DRIVER: process.env[ENV_KEYS.FILE_DRIVER] || '',
    BUCKET_NAME: process.env[ENV_KEYS.BUCKET_NAME] || undefined,
    BUCKET_PATH: process.env[ENV_KEYS.BUCKET_PATH] || undefined,
    LOCAL_PATH: process.env[ENV_KEYS.LOCAL_PATH] || undefined,
    PRESIGNED_URL_EXPIRY: process.env[ENV_KEYS.PRESIGNED_URL_EXPIRY] || undefined,
    MAX_FILE_SIZE: process.env[ENV_KEYS.MAX_FILE_SIZE] || undefined,
    
    AWS_REGION: process.env[ENV_KEYS.AWS_REGION] || undefined,
    AWS_ACCESS_KEY: process.env[ENV_KEYS.AWS_ACCESS_KEY] || undefined,
    AWS_SECRET_KEY: process.env[ENV_KEYS.AWS_SECRET_KEY] || undefined,
    
    GCS_PROJECT_ID: process.env[ENV_KEYS.GCS_PROJECT_ID] || undefined,
    GCS_CREDENTIALS: process.env[ENV_KEYS.GCS_CREDENTIALS] || undefined,
    
    AZURE_CONNECTION_STRING: process.env[ENV_KEYS.AZURE_CONNECTION_STRING] || undefined,
    AZURE_ACCOUNT_NAME: process.env[ENV_KEYS.AZURE_ACCOUNT_NAME] || undefined,
    AZURE_ACCOUNT_KEY: process.env[ENV_KEYS.AZURE_ACCOUNT_KEY] || undefined,
    AZURE_CONTAINER_NAME: process.env[ENV_KEYS.AZURE_CONTAINER_NAME] || undefined,
  };
}

/**
 * Safely parses a string to an integer, returning a default for invalid values.
 * 
 * Unlike parseInt(), this function rejects strings with trailing non-numeric characters.
 * For example, "100abc" returns the default value, not 100.
 */
function parseIntSafe(value: string | undefined, defaultValue: number | undefined): number | undefined {
  if (!value) return defaultValue;
  
  // Trim whitespace and check if the entire string is a valid integer
  const trimmed = value.trim();
  
  // Check if the string matches a valid integer pattern (optional sign followed by digits)
  if (!/^-?\d+$/.test(trimmed)) {
    return defaultValue;
  }
  
  const parsed = parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Converts environment variables into a StorageConfig object.
 */
export function environmentToStorageConfig(envConfig: EnvironmentConfig): StorageConfig {
  const config: StorageConfig = {
    driver: envConfig.FILE_DRIVER as StorageConfig['driver'],
    bucketName: envConfig.BUCKET_NAME,
    bucketPath: envConfig.BUCKET_PATH || '',
    localPath: envConfig.LOCAL_PATH || DEFAULT_CONFIG.localPath,
    presignedUrlExpiry: parseIntSafe(envConfig.PRESIGNED_URL_EXPIRY, DEFAULT_CONFIG.presignedUrlExpiry),
    maxFileSize: parseIntSafe(envConfig.MAX_FILE_SIZE, undefined),
    
    awsRegion: envConfig.AWS_REGION,
    awsAccessKey: envConfig.AWS_ACCESS_KEY,
    awsSecretKey: envConfig.AWS_SECRET_KEY,
    
    gcsProjectId: envConfig.GCS_PROJECT_ID,
    gcsCredentials: envConfig.GCS_CREDENTIALS,
    
    azureConnectionString: envConfig.AZURE_CONNECTION_STRING,
    azureAccountName: envConfig.AZURE_ACCOUNT_NAME,
    azureAccountKey: envConfig.AZURE_ACCOUNT_KEY,
    azureContainerName: envConfig.AZURE_CONTAINER_NAME,
  };

  return config;
}

/**
 * Validates a storage configuration.
 * 
 * Checks that:
 * - A valid driver is specified
 * - Required credentials are present for the chosen driver
 * - Numeric values are within acceptable ranges
 * 
 * Returns an object with isValid and an array of error messages.
 */
export function validateStorageConfig(config: StorageConfig): ValidationResult {
  const errors: string[] = [];

  // Check driver
  if (!config.driver) {
    errors.push('FILE_DRIVER is required');
  } else if (!['s3', 's3-presigned', 'gcs', 'gcs-presigned', 'azure', 'azure-presigned', 'local'].includes(config.driver)) {
    errors.push(`Invalid FILE_DRIVER: ${config.driver}. Must be one of: s3, s3-presigned, gcs, gcs-presigned, azure, azure-presigned, local`);
  }

  // S3 requirements
  if (config.driver?.includes('s3')) {
    if (!config.bucketName) errors.push('BUCKET_NAME is required for S3');
    if (!config.awsRegion) errors.push('AWS_REGION is required for S3');
    // Access keys are optional — IAM roles work when running on AWS
  }

  // GCS requirements
  if (config.driver?.includes('gcs')) {
    if (!config.bucketName) errors.push('BUCKET_NAME is required for GCS');
    if (!config.gcsProjectId) errors.push('GCS_PROJECT_ID is required for GCS');
    // Credentials are optional — ADC works when running on GCP
  }

  // Azure requirements
  if (config.driver?.includes('azure')) {
    const hasConnectionString = !!config.azureConnectionString;
    const hasAccountKey = config.azureAccountName && config.azureAccountKey;
    const hasManagedIdentity = config.azureAccountName && !config.azureAccountKey;
    
    if (config.driver === 'azure-presigned') {
      // Presigned mode needs account key for SAS URL generation
      if (!hasConnectionString && !hasAccountKey) {
        errors.push('Azure presigned driver requires either AZURE_CONNECTION_STRING or both AZURE_ACCOUNT_NAME and AZURE_ACCOUNT_KEY (Managed Identity cannot generate SAS URLs)');
      }
    } else {
      // Direct mode supports any authentication method
      if (!hasConnectionString && !hasAccountKey && !hasManagedIdentity) {
        errors.push('Azure requires AZURE_CONNECTION_STRING, AZURE_ACCOUNT_NAME + AZURE_ACCOUNT_KEY, or AZURE_ACCOUNT_NAME only (for Managed Identity)');
      }
    }
    
    if (!config.azureContainerName && !config.bucketName) {
      errors.push('AZURE_CONTAINER_NAME or BUCKET_NAME is required for Azure');
    }
  }

  // Validate URL expiry time
  if (config.presignedUrlExpiry !== undefined) {
    if (Number.isNaN(config.presignedUrlExpiry) || config.presignedUrlExpiry <= 0) {
      errors.push('PRESIGNED_URL_EXPIRY must be a positive number greater than 0');
    }
    // Max 7 days — that's the cloud provider limit
    const MAX_EXPIRY = 604800;
    if (!Number.isNaN(config.presignedUrlExpiry) && config.presignedUrlExpiry > MAX_EXPIRY) {
      errors.push(`PRESIGNED_URL_EXPIRY cannot exceed ${MAX_EXPIRY} seconds (7 days). Cloud providers enforce this limit.`);
    }
  }

  // Validate max file size
  if (config.maxFileSize !== undefined) {
    if (Number.isNaN(config.maxFileSize) || config.maxFileSize <= 0) {
      errors.push('MAX_FILE_SIZE must be a positive number greater than 0');
    }
    // Max 5TB — reasonable limit for single uploads
    const MAX_FILE_SIZE_LIMIT = 5 * 1024 * 1024 * 1024 * 1024;
    if (!Number.isNaN(config.maxFileSize) && config.maxFileSize > MAX_FILE_SIZE_LIMIT) {
      errors.push(`MAX_FILE_SIZE cannot exceed ${MAX_FILE_SIZE_LIMIT} bytes (5TB). Consider using multipart uploads for larger files.`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Convenience function that loads and validates config in one call.
 * Returns both the config and validation result.
 */
export function loadAndValidateConfig(): { config: StorageConfig; validation: ValidationResult } {
  const envConfig = loadEnvironmentConfig();
  const config = environmentToStorageConfig(envConfig);
  const validation = validateStorageConfig(config);

  return { config, validation };
}

/**
 * Resets the dotenv initialization flag.
 * 
 * This is primarily useful for testing scenarios where you need to
 * reinitialize dotenv with different environment variables.
 * 
 * WARNING: This does not clear previously loaded environment variables.
 * It only allows initializeDotenv() to run again.
 */
export function resetDotenvInitialization(): void {
  dotenvInitialized = false;
}
