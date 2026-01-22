// Storage driver types
export type StorageDriver = 
  | 's3' 
  | 's3-presigned' 
  | 'gcs' 
  | 'gcs-presigned' 
  | 'azure'
  | 'azure-presigned'
  | 'local';

// File upload result
export interface FileUploadResult {
  success: boolean;
  fileName?: string;
  fileUrl?: string;
  error?: string;
}

// Presigned URL result
export interface PresignedUrlResult {
  success: boolean;
  fileName?: string;
  uploadUrl?: string;
  viewUrl?: string;
  contentType?: string;
  maxSize?: number;
  expiresIn?: number;
  error?: string;
}

// File validation options
export interface FileValidationOptions {
  maxSize?: number; // in bytes
  allowedMimeTypes?: string[];
  allowedExtensions?: string[];
}

// Storage credentials configuration
export interface StorageCredentials {
  // Common
  bucketName?: string;
  localPath?: string;
  presignedUrlExpiry?: number; // in seconds, default 600 (10 minutes)
  
  // AWS S3 Configuration
  awsRegion?: string;
  awsAccessKey?: string;
  awsSecretKey?: string;
  
  // Google Cloud Storage Configuration
  gcsProjectId?: string;
  gcsCredentials?: string;
  
  // Azure Blob Storage Configuration
  azureConnectionString?: string;
  azureAccountName?: string;
  azureAccountKey?: string;
  azureContainerName?: string;
}

// Storage initialization options
export interface StorageOptions {
  driver: StorageDriver;
  credentials?: StorageCredentials;
}

// Legacy storage configuration (internal use)
export interface StorageConfig {
  driver: StorageDriver;
  bucketName?: string | undefined;
  localPath?: string | undefined;
  presignedUrlExpiry?: number | undefined;
  
  // AWS S3 Configuration
  awsRegion?: string | undefined;
  awsAccessKey?: string | undefined;
  awsSecretKey?: string | undefined;
  
  // Google Cloud Storage Configuration
  gcsProjectId?: string | undefined;
  gcsCredentials?: string | undefined;
  
  // Azure Blob Storage Configuration
  azureConnectionString?: string | undefined;
  azureAccountName?: string | undefined;
  azureAccountKey?: string | undefined;
  azureContainerName?: string | undefined;
}

// File input types
export interface SingleFileInput {
  type: 'single';
  file: Express.Multer.File;
}

export interface MultipleFilesInput {
  type: 'multiple';
  files: Express.Multer.File[];
}

export type FileInput = SingleFileInput | MultipleFilesInput;

// Storage driver interface
export interface IStorageDriver {
  upload(file: Express.Multer.File): Promise<FileUploadResult>;
  uploadMultiple(files: Express.Multer.File[]): Promise<FileUploadResult[]>;
  generateUploadUrl(fileName: string, contentType?: string, maxSize?: number): Promise<PresignedUrlResult>;
  generateViewUrl(fileName: string): Promise<PresignedUrlResult>;
  generateMultipleUploadUrls(fileNames: string[]): Promise<PresignedUrlResult[]>;
  generateMultipleViewUrls(fileNames: string[]): Promise<PresignedUrlResult[]>;
  delete(fileName: string): Promise<boolean>;
  deleteMultiple(fileNames: string[]): Promise<boolean[]>;
}

// Validation result
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// Environment variables interface
export interface EnvironmentConfig {
  FILE_DRIVER: string;
  BUCKET_NAME?: string | undefined;
  LOCAL_PATH?: string | undefined;
  PRESIGNED_URL_EXPIRY?: string | undefined;
  
  // AWS S3
  AWS_REGION?: string | undefined;
  AWS_ACCESS_KEY?: string | undefined;
  AWS_SECRET_KEY?: string | undefined;
  
  // Google Cloud Storage
  GCS_PROJECT_ID?: string | undefined;
  GCS_CREDENTIALS?: string | undefined;
  
  // Azure Blob Storage
  AZURE_CONNECTION_STRING?: string | undefined;
  AZURE_ACCOUNT_NAME?: string | undefined;
  AZURE_ACCOUNT_KEY?: string | undefined;
  AZURE_CONTAINER_NAME?: string | undefined;
}
