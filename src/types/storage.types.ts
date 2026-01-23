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

// Delete operation result (for detailed feedback)
export interface DeleteResult {
  success: boolean;
  fileName: string;
  error?: string;
}

// Presigned URL result
export interface PresignedUrlResult {
  success: boolean;
  fileName?: string;      // Just the filename with timestamp (e.g., "1769107318637_photo.jpg")
  filePath?: string;      // Folder path if any (e.g., "users/123/uploads")
  reference?: string;     // Full path - use this for view/delete (e.g., "users/123/uploads/1769107318637_photo.jpg")
  uploadUrl?: string;
  viewUrl?: string;
  contentType?: string;
  fileSize?: number;      // Exact file size in bytes (enforced in S3/GCS, informational for Azure)
  expiresIn?: number;
  requiresValidation?: boolean;  // True for Azure - indicates post-upload validation is needed
  error?: string;
}

// Blob validation options (for Azure post-upload validation)
export interface BlobValidationOptions {
  expectedContentType?: string;
  expectedFileSize?: number;
  /** If true, deletes the blob when validation fails (default: true) */
  deleteOnFailure?: boolean;
}

// Blob validation result
export interface BlobValidationResult {
  success: boolean;
  reference?: string;
  viewUrl?: string;
  actualContentType?: string;
  actualFileSize?: number;
  expiresIn?: number;
  error?: string;
}

// File validation options
export interface FileValidationOptions {
  maxSize?: number; // in bytes
  allowedMimeTypes?: string[];
  allowedExtensions?: string[];
}

// Upload options for customizing file upload behavior
export interface UploadOptions {
  contentType?: string;                    // Override content type
  metadata?: Record<string, string>;       // Custom metadata (key-value pairs)
  cacheControl?: string;                   // Cache-Control header (e.g., 'max-age=31536000')
  contentDisposition?: string;             // Content-Disposition header (e.g., 'attachment; filename="file.pdf"')
}

// File metadata for bulk presigned URL generation
export interface FileMetadata {
  fileName: string;                        // Original file name
  contentType?: string;                    // MIME type (e.g., 'image/jpeg')
  fileSize?: number;                       // File size in bytes
}

// Storage credentials configuration
export interface StorageCredentials {
  // Common
  bucketName?: string;
  bucketPath?: string;    // Default folder path for cloud storage (e.g., 'uploads/files')
  localPath?: string;     // Local storage directory path
  presignedUrlExpiry?: number; // in seconds, default 600 (10 minutes)
  maxFileSize?: number;   // Maximum file size in bytes, default 5GB (5 * 1024 * 1024 * 1024)
  
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

// Logger interface for custom logging
export interface Logger {
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
}

// Storage initialization options
export interface StorageOptions {
  driver: StorageDriver;
  credentials?: StorageCredentials;
  logger?: Logger;  // Optional custom logger
}

// Legacy storage configuration (internal use)
export interface StorageConfig {
  driver: StorageDriver;
  bucketName?: string | undefined;
  bucketPath?: string | undefined;    // Default folder path for cloud storage
  localPath?: string | undefined;
  presignedUrlExpiry?: number | undefined;
  maxFileSize?: number | undefined;   // Maximum file size in bytes
  
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

// List files result
export interface ListFilesResult {
  success: boolean;
  files?: FileInfo[];
  nextToken?: string;  // For pagination
  error?: string;
}

// File info for listing
export interface FileInfo {
  name: string;
  size?: number;
  contentType?: string;
  lastModified?: Date;
}

// Storage driver interface
export interface IStorageDriver {
  upload(file: Express.Multer.File, options?: UploadOptions): Promise<FileUploadResult>;
  uploadMultiple(files: Express.Multer.File[], options?: UploadOptions): Promise<FileUploadResult[]>;
  generateUploadUrl(fileName: string, contentType?: string, fileSize?: number): Promise<PresignedUrlResult>;
  generateViewUrl(fileName: string): Promise<PresignedUrlResult>;
  generateMultipleUploadUrls(files: FileMetadata[]): Promise<PresignedUrlResult[]>;
  generateMultipleViewUrls(fileNames: string[]): Promise<PresignedUrlResult[]>;
  delete(fileName: string): Promise<boolean>;
  deleteMultiple(fileNames: string[]): Promise<DeleteResult[]>;
  // Azure-specific: validate blob after upload (returns success for S3/GCS as they validate at URL level)
  validateAndConfirmUpload(reference: string, options?: BlobValidationOptions): Promise<BlobValidationResult>;
  // List files with optional prefix and pagination
  listFiles(prefix?: string, maxResults?: number, continuationToken?: string): Promise<ListFilesResult>;
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
  BUCKET_PATH?: string | undefined;
  LOCAL_PATH?: string | undefined;
  PRESIGNED_URL_EXPIRY?: string | undefined;
  MAX_FILE_SIZE?: string | undefined;
  
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
