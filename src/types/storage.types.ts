/**
 * The storage drivers you can use.
 * 
 * Direct drivers upload through your server.
 * Presigned drivers give you URLs for client-side uploads.
 */
export type StorageDriver = 
  | 's3' 
  | 's3-presigned' 
  | 'gcs' 
  | 'gcs-presigned' 
  | 'azure'
  | 'azure-presigned'
  | 'local';

/**
 * What you get back after uploading a file.
 */
export interface FileUploadResult {
  success: boolean;
  /** The filename as stored (includes timestamp prefix) */
  fileName?: string;
  /** URL to access the file */
  fileUrl?: string;
  /** What went wrong (if success is false) */
  error?: string;
}

/**
 * What you get back after deleting a file.
 */
export interface DeleteResult {
  success: boolean;
  /** The file that was (or wasn't) deleted */
  fileName: string;
  /** What went wrong (if success is false) */
  error?: string;
}

/**
 * What you get back when generating presigned URLs.
 */
export interface PresignedUrlResult {
  success: boolean;
  /** Just the filename with timestamp (e.g., "1769107318637_photo.jpg") */
  fileName?: string;
  /** Folder path if any (e.g., "users/123/uploads") */
  filePath?: string;
  /** Full path — use this for view/delete operations */
  reference?: string;
  /** URL for uploading (PUT request goes here) */
  uploadUrl?: string;
  /** URL for viewing/downloading */
  viewUrl?: string;
  /** The content type this URL is restricted to */
  contentType?: string;
  /** The file size this URL is restricted to (S3/GCS enforce this) */
  fileSize?: number;
  /** How long until this URL expires (seconds) */
  expiresIn?: number;
  /** True for Azure — you must call validateAndConfirmUpload after */
  requiresValidation?: boolean;
  /** What went wrong (if success is false) */
  error?: string;
}

/**
 * Options for validating uploads (especially important for Azure).
 */
export interface BlobValidationOptions {
  /** The content type you're expecting */
  expectedContentType?: string;
  /** The file size you're expecting (in bytes) */
  expectedFileSize?: number;
  /** Delete the file if validation fails (default: true) */
  deleteOnFailure?: boolean;
}

/**
 * What you get back after validating an upload.
 */
export interface BlobValidationResult {
  success: boolean;
  /** The file reference that was validated */
  reference?: string;
  /** URL to view the file (if validation passed) */
  viewUrl?: string;
  /** What the file's content type actually is */
  actualContentType?: string;
  /** What the file's size actually is */
  actualFileSize?: number;
  /** How long the view URL is valid */
  expiresIn?: number;
  /** What went wrong (if success is false) */
  error?: string;
}

/**
 * Options for validating files before upload.
 */
export interface FileValidationOptions {
  /** Maximum file size in bytes */
  maxSize?: number;
  /** Allowed MIME types (e.g., ['image/jpeg', 'image/png']) */
  allowedMimeTypes?: string[];
  /** Allowed extensions (e.g., ['.jpg', '.png'] or ['jpg', 'png']) */
  allowedExtensions?: string[];
}

/**
 * Options for customizing how files are uploaded.
 */
export interface UploadOptions {
  /** Override the detected content type */
  contentType?: string;
  /** Custom metadata (key-value pairs stored with the file) */
  metadata?: Record<string, string>;
  /** Cache-Control header (e.g., 'max-age=31536000') */
  cacheControl?: string;
  /** Content-Disposition header (e.g., 'attachment; filename="file.pdf"') */
  contentDisposition?: string;
}

/**
 * File metadata for generating multiple presigned URLs at once.
 */
export interface FileMetadata {
  /** The filename */
  fileName: string;
  /** MIME type (e.g., 'image/jpeg') */
  contentType?: string;
  /** File size in bytes */
  fileSize?: number;
}

/**
 * Credentials and settings for storage configuration.
 * 
 * These can be passed programmatically to override environment variables.
 * 
 * @example
 * // Override bucket name programmatically
 * const storage = new StorageManager({
 *   driver: 's3',
 *   credentials: {
 *     bucketName: 'my-custom-bucket',  // Overrides BUCKET_NAME env var
 *     awsRegion: 'us-west-2',
 *   }
 * });
 * 
 * @example
 * // Use different Azure container than BUCKET_NAME
 * const storage = new StorageManager({
 *   driver: 'azure',
 *   credentials: {
 *     azureContainerName: 'custom-container',  // Overrides BUCKET_NAME for Azure
 *     azureConnectionString: '...',
 *   }
 * });
 */
export interface StorageCredentials {
  /** Bucket or container name (S3/GCS bucket, Azure container) */
  bucketName?: string;
  /** Default folder path (e.g., 'uploads/files') */
  bucketPath?: string;
  /** Local storage directory */
  localPath?: string;
  /** How long presigned URLs stay valid (seconds, default: 600) */
  presignedUrlExpiry?: number;
  /** Maximum file size (bytes, default: 5GB) */
  maxFileSize?: number;
  
  // AWS S3
  awsRegion?: string;
  awsAccessKey?: string;
  awsSecretKey?: string;
  
  // Google Cloud Storage
  gcsProjectId?: string;
  gcsCredentials?: string;
  
  // Azure Blob Storage
  azureConnectionString?: string;
  azureAccountName?: string;
  azureAccountKey?: string;
  /** Azure container name (overrides bucketName for Azure driver) */
  azureContainerName?: string;
}

/**
 * Logging interface — pass your own logger if you want debug output.
 */
export interface Logger {
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
}

/**
 * Rate limiting options for presigned URL generation.
 * Helps prevent abuse by limiting how many URLs can be generated in a time window.
 */
export interface RateLimitOptions {
  /** Maximum number of presigned URLs that can be generated per window */
  maxRequests: number;
  /** Time window in milliseconds (default: 60000 = 1 minute) */
  windowMs?: number;
}

/**
 * Options for initializing StorageManager.
 */
export interface StorageOptions {
  /** Which storage driver to use */
  driver: StorageDriver;
  /** Credentials and settings (optional — can come from env vars) */
  credentials?: StorageCredentials;
  /** Your logger (optional — silent by default) */
  logger?: Logger;
  /** Rate limiting for presigned URL generation (optional — disabled by default) */
  rateLimit?: RateLimitOptions;
}

/**
 * Internal configuration format (used by drivers).
 */
export interface StorageConfig {
  driver: StorageDriver;
  bucketName?: string | undefined;
  bucketPath?: string | undefined;
  localPath?: string | undefined;
  presignedUrlExpiry?: number | undefined;
  maxFileSize?: number | undefined;
  
  awsRegion?: string | undefined;
  awsAccessKey?: string | undefined;
  awsSecretKey?: string | undefined;
  
  gcsProjectId?: string | undefined;
  gcsCredentials?: string | undefined;
  
  azureConnectionString?: string | undefined;
  azureAccountName?: string | undefined;
  azureAccountKey?: string | undefined;
  azureContainerName?: string | undefined;
}

/**
 * Input types for the generic upload() method.
 */
export interface SingleFileInput {
  type: 'single';
  file: Express.Multer.File;
}

export interface MultipleFilesInput {
  type: 'multiple';
  files: Express.Multer.File[];
}

export type FileInput = SingleFileInput | MultipleFilesInput;

/**
 * What you get back when listing files.
 */
export interface ListFilesResult {
  success: boolean;
  /** The files found */
  files?: FileInfo[];
  /** Token for getting the next page of results */
  nextToken?: string;
  /** What went wrong (if success is false) */
  error?: string;
}

/**
 * Information about a single file.
 */
export interface FileInfo {
  /** File path/name */
  name: string;
  /** File size in bytes */
  size?: number;
  /** MIME type */
  contentType?: string;
  /** When the file was last modified */
  lastModified?: Date;
}

/**
 * The interface all storage drivers implement.
 */
export interface IStorageDriver {
  upload(file: Express.Multer.File, options?: UploadOptions): Promise<FileUploadResult>;
  uploadMultiple(files: Express.Multer.File[], options?: UploadOptions): Promise<FileUploadResult[]>;
  generateUploadUrl(fileName: string, contentType?: string, fileSize?: number): Promise<PresignedUrlResult>;
  generateViewUrl(fileName: string): Promise<PresignedUrlResult>;
  delete(fileName: string): Promise<boolean>;
  deleteMultiple(fileNames: string[]): Promise<DeleteResult[]>;
  validateAndConfirmUpload(reference: string, options?: BlobValidationOptions): Promise<BlobValidationResult>;
  listFiles(prefix?: string, maxResults?: number, continuationToken?: string): Promise<ListFilesResult>;
}

/**
 * Result of configuration validation.
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Environment variables we look for.
 */
export interface EnvironmentConfig {
  FILE_DRIVER: string;
  BUCKET_NAME?: string | undefined;
  BUCKET_PATH?: string | undefined;
  LOCAL_PATH?: string | undefined;
  PRESIGNED_URL_EXPIRY?: string | undefined;
  MAX_FILE_SIZE?: string | undefined;
  
  AWS_REGION?: string | undefined;
  AWS_ACCESS_KEY?: string | undefined;
  AWS_SECRET_KEY?: string | undefined;
  
  GCS_PROJECT_ID?: string | undefined;
  GCS_CREDENTIALS?: string | undefined;
  
  AZURE_CONNECTION_STRING?: string | undefined;
  AZURE_ACCOUNT_NAME?: string | undefined;
  AZURE_ACCOUNT_KEY?: string | undefined;
}
