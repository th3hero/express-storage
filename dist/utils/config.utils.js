import dotenv from 'dotenv';
// Track if dotenv has been initialized
let dotenvInitialized = false;
/**
 * Initialize dotenv if not already done
 * Call this before loading environment config if needed
 */
export function initializeDotenv() {
    if (!dotenvInitialized) {
        dotenv.config();
        dotenvInitialized = true;
    }
}
// Environment variable keys
const ENV_KEYS = {
    FILE_DRIVER: 'FILE_DRIVER',
    BUCKET_NAME: 'BUCKET_NAME',
    BUCKET_PATH: 'BUCKET_PATH',
    LOCAL_PATH: 'LOCAL_PATH',
    PRESIGNED_URL_EXPIRY: 'PRESIGNED_URL_EXPIRY',
    MAX_FILE_SIZE: 'MAX_FILE_SIZE',
    // AWS S3
    AWS_REGION: 'AWS_REGION',
    AWS_ACCESS_KEY: 'AWS_ACCESS_KEY',
    AWS_SECRET_KEY: 'AWS_SECRET_KEY',
    // Google Cloud Storage
    GCS_PROJECT_ID: 'GCS_PROJECT_ID',
    GCS_CREDENTIALS: 'GCS_CREDENTIALS',
    // Azure Blob Storage
    AZURE_CONNECTION_STRING: 'AZURE_CONNECTION_STRING',
    AZURE_ACCOUNT_NAME: 'AZURE_ACCOUNT_NAME',
    AZURE_ACCOUNT_KEY: 'AZURE_ACCOUNT_KEY',
    AZURE_CONTAINER_NAME: 'AZURE_CONTAINER_NAME',
};
// Default configuration
const DEFAULT_CONFIG = {
    presignedUrlExpiry: 600, // 10 minutes
    localPath: 'public/express-storage',
};
/**
 * Load environment configuration
 * Automatically initializes dotenv on first call
 */
export function loadEnvironmentConfig() {
    // Initialize dotenv lazily on first use
    initializeDotenv();
    return {
        FILE_DRIVER: process.env[ENV_KEYS.FILE_DRIVER] || '',
        BUCKET_NAME: process.env[ENV_KEYS.BUCKET_NAME] || undefined,
        BUCKET_PATH: process.env[ENV_KEYS.BUCKET_PATH] || undefined,
        LOCAL_PATH: process.env[ENV_KEYS.LOCAL_PATH] || undefined,
        PRESIGNED_URL_EXPIRY: process.env[ENV_KEYS.PRESIGNED_URL_EXPIRY] || undefined,
        MAX_FILE_SIZE: process.env[ENV_KEYS.MAX_FILE_SIZE] || undefined,
        // AWS S3
        AWS_REGION: process.env[ENV_KEYS.AWS_REGION] || undefined,
        AWS_ACCESS_KEY: process.env[ENV_KEYS.AWS_ACCESS_KEY] || undefined,
        AWS_SECRET_KEY: process.env[ENV_KEYS.AWS_SECRET_KEY] || undefined,
        // Google Cloud Storage
        GCS_PROJECT_ID: process.env[ENV_KEYS.GCS_PROJECT_ID] || undefined,
        GCS_CREDENTIALS: process.env[ENV_KEYS.GCS_CREDENTIALS] || undefined,
        // Azure Blob Storage
        AZURE_CONNECTION_STRING: process.env[ENV_KEYS.AZURE_CONNECTION_STRING] || undefined,
        AZURE_ACCOUNT_NAME: process.env[ENV_KEYS.AZURE_ACCOUNT_NAME] || undefined,
        AZURE_ACCOUNT_KEY: process.env[ENV_KEYS.AZURE_ACCOUNT_KEY] || undefined,
        AZURE_CONTAINER_NAME: process.env[ENV_KEYS.AZURE_CONTAINER_NAME] || undefined,
    };
}
/**
 * Convert environment config to storage config
 */
export function environmentToStorageConfig(envConfig) {
    const config = {
        driver: envConfig.FILE_DRIVER,
        bucketName: envConfig.BUCKET_NAME,
        bucketPath: envConfig.BUCKET_PATH || '',
        localPath: envConfig.LOCAL_PATH || DEFAULT_CONFIG.localPath,
        presignedUrlExpiry: envConfig.PRESIGNED_URL_EXPIRY
            ? parseInt(envConfig.PRESIGNED_URL_EXPIRY, 10)
            : DEFAULT_CONFIG.presignedUrlExpiry,
        maxFileSize: envConfig.MAX_FILE_SIZE
            ? parseInt(envConfig.MAX_FILE_SIZE, 10)
            : undefined,
        // AWS S3
        awsRegion: envConfig.AWS_REGION,
        awsAccessKey: envConfig.AWS_ACCESS_KEY,
        awsSecretKey: envConfig.AWS_SECRET_KEY,
        // Google Cloud Storage
        gcsProjectId: envConfig.GCS_PROJECT_ID,
        gcsCredentials: envConfig.GCS_CREDENTIALS,
        // Azure Blob Storage
        azureConnectionString: envConfig.AZURE_CONNECTION_STRING,
        azureAccountName: envConfig.AZURE_ACCOUNT_NAME,
        azureAccountKey: envConfig.AZURE_ACCOUNT_KEY,
        azureContainerName: envConfig.AZURE_CONTAINER_NAME,
    };
    return config;
}
/**
 * Validate storage configuration
 */
export function validateStorageConfig(config) {
    const errors = [];
    // Validate driver
    if (!config.driver) {
        errors.push('FILE_DRIVER is required');
    }
    else if (!['s3', 's3-presigned', 'gcs', 'gcs-presigned', 'azure', 'azure-presigned', 'local'].includes(config.driver)) {
        errors.push(`Invalid FILE_DRIVER: ${config.driver}. Must be one of: s3, s3-presigned, gcs, gcs-presigned, azure, azure-presigned, local`);
    }
    // Validate cloud storage requirements
    if (config.driver?.includes('s3')) {
        if (!config.bucketName)
            errors.push('BUCKET_NAME is required for S3');
        if (!config.awsRegion)
            errors.push('AWS_REGION is required for S3');
        // AWS_ACCESS_KEY and AWS_SECRET_KEY are optional - when not provided, the SDK uses
        // the default credential provider chain (IAM roles, environment variables, shared credentials, etc.)
    }
    if (config.driver?.includes('gcs')) {
        if (!config.bucketName)
            errors.push('BUCKET_NAME is required for GCS');
        if (!config.gcsProjectId)
            errors.push('GCS_PROJECT_ID is required for GCS');
        // GCS_CREDENTIALS is optional - when not provided, Application Default Credentials (ADC) will be used
    }
    if (config.driver?.includes('azure')) {
        const hasConnectionString = !!config.azureConnectionString;
        const hasAccountKey = config.azureAccountName && config.azureAccountKey;
        const hasManagedIdentity = config.azureAccountName && !config.azureAccountKey;
        if (config.driver === 'azure-presigned') {
            // Presigned driver requires account key for SAS URL generation
            if (!hasConnectionString && !hasAccountKey) {
                errors.push('Azure presigned driver requires either AZURE_CONNECTION_STRING or both AZURE_ACCOUNT_NAME and AZURE_ACCOUNT_KEY (Managed Identity cannot generate SAS URLs)');
            }
        }
        else {
            // Regular azure driver supports: connection string, account key, OR managed identity
            if (!hasConnectionString && !hasAccountKey && !hasManagedIdentity) {
                errors.push('Azure requires AZURE_CONNECTION_STRING, AZURE_ACCOUNT_NAME + AZURE_ACCOUNT_KEY, or AZURE_ACCOUNT_NAME only (for Managed Identity)');
            }
        }
        // Container name can use BUCKET_NAME or AZURE_CONTAINER_NAME
        if (!config.azureContainerName && !config.bucketName) {
            errors.push('AZURE_CONTAINER_NAME or BUCKET_NAME is required for Azure');
        }
    }
    // Validate presigned URL expiry
    if (config.presignedUrlExpiry !== undefined) {
        if (config.presignedUrlExpiry <= 0) {
            errors.push('PRESIGNED_URL_EXPIRY must be greater than 0');
        }
        // Cloud providers have maximum limits:
        // - S3: 7 days (604800 seconds) with IAM credentials, 36 hours with STS
        // - GCS: 7 days (604800 seconds)
        // - Azure: varies by SAS type, but commonly 7 days
        const MAX_EXPIRY = 604800; // 7 days in seconds
        if (config.presignedUrlExpiry > MAX_EXPIRY) {
            errors.push(`PRESIGNED_URL_EXPIRY cannot exceed ${MAX_EXPIRY} seconds (7 days). Cloud providers enforce this limit.`);
        }
    }
    // Validate max file size
    if (config.maxFileSize !== undefined && config.maxFileSize <= 0) {
        errors.push('MAX_FILE_SIZE must be greater than 0');
    }
    return {
        isValid: errors.length === 0,
        errors,
    };
}
/**
 * Load and validate configuration from environment
 */
export function loadAndValidateConfig() {
    const envConfig = loadEnvironmentConfig();
    const config = environmentToStorageConfig(envConfig);
    const validation = validateStorageConfig(config);
    return { config, validation };
}
//# sourceMappingURL=config.utils.js.map