export type StorageDriver = 's3' | 's3-presigned' | 'gcs' | 'gcs-presigned' | 'azure' | 'azure-presigned' | 'local';
export interface FileUploadResult {
    success: boolean;
    fileName?: string;
    fileUrl?: string;
    error?: string;
}
export interface DeleteResult {
    success: boolean;
    fileName: string;
    error?: string;
}
export interface PresignedUrlResult {
    success: boolean;
    fileName?: string;
    filePath?: string;
    reference?: string;
    uploadUrl?: string;
    viewUrl?: string;
    contentType?: string;
    fileSize?: number;
    expiresIn?: number;
    requiresValidation?: boolean;
    error?: string;
}
export interface BlobValidationOptions {
    expectedContentType?: string;
    expectedFileSize?: number;
    /** If true, deletes the blob when validation fails (default: true) */
    deleteOnFailure?: boolean;
}
export interface BlobValidationResult {
    success: boolean;
    reference?: string;
    viewUrl?: string;
    actualContentType?: string;
    actualFileSize?: number;
    expiresIn?: number;
    error?: string;
}
export interface FileValidationOptions {
    maxSize?: number;
    allowedMimeTypes?: string[];
    allowedExtensions?: string[];
}
export interface UploadOptions {
    contentType?: string;
    metadata?: Record<string, string>;
    cacheControl?: string;
    contentDisposition?: string;
}
export interface FileMetadata {
    fileName: string;
    contentType?: string;
    fileSize?: number;
}
export interface StorageCredentials {
    bucketName?: string;
    bucketPath?: string;
    localPath?: string;
    presignedUrlExpiry?: number;
    maxFileSize?: number;
    awsRegion?: string;
    awsAccessKey?: string;
    awsSecretKey?: string;
    gcsProjectId?: string;
    gcsCredentials?: string;
    azureConnectionString?: string;
    azureAccountName?: string;
    azureAccountKey?: string;
    azureContainerName?: string;
}
export interface Logger {
    debug: (message: string, ...args: unknown[]) => void;
    info: (message: string, ...args: unknown[]) => void;
    warn: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
}
export interface StorageOptions {
    driver: StorageDriver;
    credentials?: StorageCredentials;
    logger?: Logger;
}
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
export interface SingleFileInput {
    type: 'single';
    file: Express.Multer.File;
}
export interface MultipleFilesInput {
    type: 'multiple';
    files: Express.Multer.File[];
}
export type FileInput = SingleFileInput | MultipleFilesInput;
export interface ListFilesResult {
    success: boolean;
    files?: FileInfo[];
    nextToken?: string;
    error?: string;
}
export interface FileInfo {
    name: string;
    size?: number;
    contentType?: string;
    lastModified?: Date;
}
export interface IStorageDriver {
    upload(file: Express.Multer.File, options?: UploadOptions): Promise<FileUploadResult>;
    uploadMultiple(files: Express.Multer.File[], options?: UploadOptions): Promise<FileUploadResult[]>;
    generateUploadUrl(fileName: string, contentType?: string, fileSize?: number): Promise<PresignedUrlResult>;
    generateViewUrl(fileName: string): Promise<PresignedUrlResult>;
    generateMultipleUploadUrls(files: FileMetadata[]): Promise<PresignedUrlResult[]>;
    generateMultipleViewUrls(fileNames: string[]): Promise<PresignedUrlResult[]>;
    delete(fileName: string): Promise<boolean>;
    deleteMultiple(fileNames: string[]): Promise<DeleteResult[]>;
    validateAndConfirmUpload(reference: string, options?: BlobValidationOptions): Promise<BlobValidationResult>;
    listFiles(prefix?: string, maxResults?: number, continuationToken?: string): Promise<ListFilesResult>;
}
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
}
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
    AZURE_CONTAINER_NAME?: string | undefined;
}
//# sourceMappingURL=storage.types.d.ts.map