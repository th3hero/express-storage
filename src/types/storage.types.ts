import { Request } from 'express';

// Storage driver types
export type StorageDriver = 
  | 's3' 
  | 's3-presigned' 
  | 'gcs' 
  | 'gcs-presigned' 
  | 'oci' 
  | 'oci-presigned' 
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
  uploadUrl?: string;
  viewUrl?: string;
  error?: string;
}

// Storage configuration
export interface StorageConfig {
  driver: StorageDriver;
  bucketName?: string | undefined;
  localPath?: string | undefined;
  presignedUrlExpiry?: number | undefined; // in seconds, default 600 (10 minutes)
  
  // AWS S3 Configuration
  awsRegion?: string | undefined;
  awsAccessKey?: string | undefined;
  awsSecretKey?: string | undefined;
  
  // Google Cloud Storage Configuration
  gcsProjectId?: string | undefined;
  gcsCredentials?: string | undefined;
  
  // Oracle Cloud Infrastructure Configuration
  ociRegion?: string | undefined;
  ociCredentials?: string | undefined;
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
  generateUploadUrl(fileName: string): Promise<PresignedUrlResult>;
  generateViewUrl(fileName: string): Promise<PresignedUrlResult>;
  generateMultipleUploadUrls(fileNames: string[]): Promise<PresignedUrlResult[]>;
  generateMultipleViewUrls(fileNames: string[]): Promise<PresignedUrlResult[]>;
  delete(fileName: string): Promise<boolean>;
  deleteMultiple(fileNames: string[]): Promise<boolean[]>;
}

// Extended Express Request
export interface StorageRequest extends Request {
  storage?: {
    files?: Express.Multer.File[];
    uploadResults?: FileUploadResult[];
  };
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
  
  // Oracle Cloud Infrastructure
  OCI_REGION?: string | undefined;
  OCI_CREDENTIALS?: string | undefined;
} 