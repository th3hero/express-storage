import dotenv from 'dotenv';
import { StorageConfig, EnvironmentConfig, ValidationResult } from '../types/storage.types.js';

// Load environment variables
dotenv.config();

// Environment variable keys
const ENV_KEYS = {
  FILE_DRIVER: 'FILE_DRIVER',
  BUCKET_NAME: 'BUCKET_NAME',
  LOCAL_PATH: 'LOCAL_PATH',
  PRESIGNED_URL_EXPIRY: 'PRESIGNED_URL_EXPIRY',
  
  // AWS S3
  AWS_REGION: 'AWS_REGION',
  AWS_ACCESS_KEY: 'AWS_ACCESS_KEY',
  AWS_SECRET_KEY: 'AWS_SECRET_KEY',
  
  // Google Cloud Storage
  GCS_PROJECT_ID: 'GCS_PROJECT_ID',
  GCS_CREDENTIALS: 'GCS_CREDENTIALS',
  
  // Oracle Cloud Infrastructure
  OCI_REGION: 'OCI_REGION',
  OCI_CREDENTIALS: 'OCI_CREDENTIALS',
} as const;

// Default configuration
const DEFAULT_CONFIG: Partial<StorageConfig> = {
  presignedUrlExpiry: 600, // 10 minutes
  localPath: 'public/express-storage',
};

/**
 * Load environment configuration
 */
export function loadEnvironmentConfig(): EnvironmentConfig {
  return {
    FILE_DRIVER: process.env[ENV_KEYS.FILE_DRIVER] || '',
    BUCKET_NAME: process.env[ENV_KEYS.BUCKET_NAME] || undefined,
    LOCAL_PATH: process.env[ENV_KEYS.LOCAL_PATH] || undefined,
    PRESIGNED_URL_EXPIRY: process.env[ENV_KEYS.PRESIGNED_URL_EXPIRY] || undefined,
    
    // AWS S3
    AWS_REGION: process.env[ENV_KEYS.AWS_REGION] || undefined,
    AWS_ACCESS_KEY: process.env[ENV_KEYS.AWS_ACCESS_KEY] || undefined,
    AWS_SECRET_KEY: process.env[ENV_KEYS.AWS_SECRET_KEY] || undefined,
    
    // Google Cloud Storage
    GCS_PROJECT_ID: process.env[ENV_KEYS.GCS_PROJECT_ID] || undefined,
    GCS_CREDENTIALS: process.env[ENV_KEYS.GCS_CREDENTIALS] || undefined,
    
    // Oracle Cloud Infrastructure
    OCI_REGION: process.env[ENV_KEYS.OCI_REGION] || undefined,
    OCI_CREDENTIALS: process.env[ENV_KEYS.OCI_CREDENTIALS] || undefined,
  };
}

/**
 * Convert environment config to storage config
 */
export function environmentToStorageConfig(envConfig: EnvironmentConfig): StorageConfig {
  const config: StorageConfig = {
    driver: envConfig.FILE_DRIVER as any,
    bucketName: envConfig.BUCKET_NAME,
    localPath: envConfig.LOCAL_PATH || DEFAULT_CONFIG.localPath,
    presignedUrlExpiry: envConfig.PRESIGNED_URL_EXPIRY 
      ? parseInt(envConfig.PRESIGNED_URL_EXPIRY, 10) 
      : DEFAULT_CONFIG.presignedUrlExpiry,
    
    // AWS S3
    awsRegion: envConfig.AWS_REGION,
    awsAccessKey: envConfig.AWS_ACCESS_KEY,
    awsSecretKey: envConfig.AWS_SECRET_KEY,
    
    // Google Cloud Storage
    gcsProjectId: envConfig.GCS_PROJECT_ID,
    gcsCredentials: envConfig.GCS_CREDENTIALS,
    
    // Oracle Cloud Infrastructure
    ociRegion: envConfig.OCI_REGION,
    ociCredentials: envConfig.OCI_CREDENTIALS,
  };

  return config;
}

/**
 * Validate storage configuration
 */
export function validateStorageConfig(config: StorageConfig): ValidationResult {
  const errors: string[] = [];

  // Validate driver
  if (!config.driver) {
    errors.push('FILE_DRIVER is required');
  } else if (!['s3', 's3-presigned', 'gcs', 'gcs-presigned', 'oci', 'oci-presigned', 'local'].includes(config.driver)) {
    errors.push(`Invalid FILE_DRIVER: ${config.driver}. Must be one of: s3, s3-presigned, gcs, gcs-presigned, oci, oci-presigned, local`);
  }

  // Validate cloud storage requirements
  if (config.driver?.includes('s3')) {
    if (!config.bucketName) errors.push('BUCKET_NAME is required for S3');
    if (!config.awsRegion) errors.push('AWS_REGION is required for S3');
    if (!config.awsAccessKey) errors.push('AWS_ACCESS_KEY is required for S3');
    if (!config.awsSecretKey) errors.push('AWS_SECRET_KEY is required for S3');
  }

  if (config.driver?.includes('gcs')) {
    if (!config.bucketName) errors.push('BUCKET_NAME is required for GCS');
    if (!config.gcsProjectId) errors.push('GCS_PROJECT_ID is required for GCS');
    if (!config.gcsCredentials) errors.push('GCS_CREDENTIALS is required for GCS');
  }

  if (config.driver?.includes('oci')) {
    if (!config.bucketName) errors.push('BUCKET_NAME is required for OCI');
    if (!config.ociRegion) errors.push('OCI_REGION is required for OCI');
    if (!config.ociCredentials) errors.push('OCI_CREDENTIALS is required for OCI');
  }

  // Validate presigned URL expiry
  if (config.presignedUrlExpiry && config.presignedUrlExpiry <= 0) {
    errors.push('PRESIGNED_URL_EXPIRY must be greater than 0');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Load and validate configuration from environment
 */
export function loadAndValidateConfig(): { config: StorageConfig; validation: ValidationResult } {
  const envConfig = loadEnvironmentConfig();
  const config = environmentToStorageConfig(envConfig);
  const validation = validateStorageConfig(config);

  return { config, validation };
} 