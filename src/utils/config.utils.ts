import { StorageConfig, EnvironmentConfig, ValidationResult } from '../types/storage.types.js';
import {
  DEFAULT_LOCAL_PATH,
  DEFAULT_PRESIGNED_URL_EXPIRY,
  isStorageDriver,
  MAX_FILE_SIZE_LIMIT,
  MAX_PRESIGNED_URL_EXPIRY,
  STORAGE_DRIVERS,
} from '../constants.js';

const DEFAULT_CONFIG: Partial<StorageConfig> = {
  presignedUrlExpiry: DEFAULT_PRESIGNED_URL_EXPIRY,
  localPath: DEFAULT_LOCAL_PATH,
};

export function loadEnvironmentConfig(): EnvironmentConfig {
  return {
    FILE_DRIVER: process.env['FILE_DRIVER'] || '',
    BUCKET_NAME: process.env['BUCKET_NAME'] || undefined,
    BUCKET_PATH: process.env['BUCKET_PATH'] || undefined,
    LOCAL_PATH: process.env['LOCAL_PATH'] || undefined,
    PRESIGNED_URL_EXPIRY: process.env['PRESIGNED_URL_EXPIRY'] || undefined,
    MAX_FILE_SIZE: process.env['MAX_FILE_SIZE'] || undefined,
    
    AWS_REGION: process.env['AWS_REGION'] || undefined,
    AWS_ACCESS_KEY: process.env['AWS_ACCESS_KEY'] || undefined,
    AWS_SECRET_KEY: process.env['AWS_SECRET_KEY'] || undefined,
    
    GCS_PROJECT_ID: process.env['GCS_PROJECT_ID'] || undefined,
    GCS_CREDENTIALS: process.env['GCS_CREDENTIALS'] || undefined,
    
    AZURE_CONNECTION_STRING: process.env['AZURE_CONNECTION_STRING'] || undefined,
    AZURE_ACCOUNT_NAME: process.env['AZURE_ACCOUNT_NAME'] || undefined,
    AZURE_ACCOUNT_KEY: process.env['AZURE_ACCOUNT_KEY'] || undefined,
  };
}

function parseIntSafe(value: string | undefined, defaultValue: number | undefined): number | undefined {
  if (!value) return defaultValue;
  
  const trimmed = value.trim();
  
  if (!/^-?\d+$/.test(trimmed)) {
    return defaultValue;
  }
  
  const parsed = parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

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
    azureContainerName: envConfig.BUCKET_NAME,
  };

  return config;
}

export function validateStorageConfig(config: StorageConfig): ValidationResult {
  const errors: string[] = [];

  if (!config.driver) {
    errors.push('FILE_DRIVER is required');
  } else if (!isStorageDriver(config.driver)) {
    errors.push(`Invalid FILE_DRIVER: ${config.driver}. Must be one of: ${STORAGE_DRIVERS.join(', ')}`);
  }

  if (config.driver?.includes('s3')) {
    if (!config.bucketName) errors.push('BUCKET_NAME is required for S3');
    if (!config.awsRegion) errors.push('AWS_REGION is required for S3');
  }

  if (config.driver?.includes('gcs')) {
    if (!config.bucketName) errors.push('BUCKET_NAME is required for GCS');
    if (!config.gcsProjectId) errors.push('GCS_PROJECT_ID is required for GCS');
  }

  if (config.driver?.includes('azure')) {
    const hasConnectionString = !!config.azureConnectionString;
    const hasAccountKey = config.azureAccountName && config.azureAccountKey;
    const hasManagedIdentity = config.azureAccountName && !config.azureAccountKey;
    
    if (config.driver === 'azure-presigned') {
      if (!hasConnectionString && !hasAccountKey) {
        errors.push('Azure presigned driver requires either AZURE_CONNECTION_STRING or both AZURE_ACCOUNT_NAME and AZURE_ACCOUNT_KEY (Managed Identity cannot generate SAS URLs)');
      }
    } else {
      if (!hasConnectionString && !hasAccountKey && !hasManagedIdentity) {
        errors.push('Azure requires AZURE_CONNECTION_STRING, AZURE_ACCOUNT_NAME + AZURE_ACCOUNT_KEY, or AZURE_ACCOUNT_NAME only (for Managed Identity)');
      }
    }
    
    if (!config.azureContainerName) {
      errors.push('BUCKET_NAME is required for Azure');
    }
  }

  if (config.presignedUrlExpiry !== undefined) {
    if (Number.isNaN(config.presignedUrlExpiry) || config.presignedUrlExpiry <= 0) {
      errors.push('PRESIGNED_URL_EXPIRY must be a positive number greater than 0');
    }
    if (!Number.isNaN(config.presignedUrlExpiry) && config.presignedUrlExpiry > MAX_PRESIGNED_URL_EXPIRY) {
      errors.push(`PRESIGNED_URL_EXPIRY cannot exceed ${MAX_PRESIGNED_URL_EXPIRY} seconds (7 days). Cloud providers enforce this limit.`);
    }
  }

  if (config.maxFileSize !== undefined) {
    if (Number.isNaN(config.maxFileSize) || config.maxFileSize <= 0) {
      errors.push('MAX_FILE_SIZE must be a positive number greater than 0');
    }
    if (!Number.isNaN(config.maxFileSize) && config.maxFileSize > MAX_FILE_SIZE_LIMIT) {
      errors.push(`MAX_FILE_SIZE cannot exceed ${MAX_FILE_SIZE_LIMIT} bytes (5TB). Consider using multipart uploads for larger files.`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function loadAndValidateConfig(): { config: StorageConfig; validation: ValidationResult } {
  const envConfig = loadEnvironmentConfig();
  const config = environmentToStorageConfig(envConfig);
  const validation = validateStorageConfig(config);

  return { config, validation };
}
