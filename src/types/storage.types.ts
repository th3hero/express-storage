export type StorageDriver =
    | "s3"
    | "s3-presigned"
    | "gcs"
    | "gcs-presigned"
    | "azure"
    | "azure-presigned"
    | "local";

export type StorageErrorCode =
    | "NO_FILE"
    | "FILE_EMPTY"
    | "FILE_TOO_LARGE"
    | "INVALID_MIME_TYPE"
    | "INVALID_EXTENSION"
    | "INVALID_FILENAME"
    | "INVALID_INPUT"
    | "PATH_TRAVERSAL"
    | "FILE_NOT_FOUND"
    | "VALIDATION_FAILED"
    | "RATE_LIMITED"
    | "HOOK_ABORTED"
    | "PRESIGNED_NOT_SUPPORTED"
    | "PROVIDER_ERROR";

export type FileUploadResult = FileUploadSuccess | FileUploadError;

export interface FileUploadSuccess {
    success: true;
    /** The stored file path — pass this to deleteFile(), getMetadata(), generateViewUrl(), etc. */
    reference: string;
    /** URL to access the file */
    fileUrl: string;
}

export interface FileUploadError {
    success: false;
    /** What went wrong */
    error: string;
    /** Programmatic error code */
    code: StorageErrorCode;
}

export type DeleteResult = DeleteSuccess | DeleteError;

export interface DeleteSuccess {
    success: true;
    /** The file reference that was deleted */
    reference: string;
}

export interface DeleteError {
    success: false;
    /** The file reference that failed to delete */
    reference: string;
    /** What went wrong */
    error: string;
    /** Programmatic error code */
    code: StorageErrorCode;
}

export type PresignedUrlResult = PresignedUrlSuccess | PresignedUrlError;

export interface PresignedUrlSuccess {
    success: true;
    /** URL for uploading (set by generateUploadUrl) */
    uploadUrl?: string;
    /** URL for viewing/downloading (set by generateViewUrl) */
    viewUrl?: string;
}

export interface PresignedUrlError {
    success: false;
    /** What went wrong */
    error: string;
    /** Programmatic error code */
    code: StorageErrorCode;
}

export type PresignedUploadUrlResult =
    | PresignedUploadUrlSuccess
    | PresignedUrlError;

export interface PresignedUploadUrlSuccess extends PresignedUrlSuccess {
    fileName: string;
    reference: string;
    uploadUrl: string;
    expiresIn: number;
    /** Folder path if any (e.g., "users/123/uploads") */
    filePath?: string;
    /** The content type this URL is restricted to */
    contentType?: string;
    /** The file size this URL is restricted to (S3/GCS enforce this) */
    fileSize?: number;
    /** True for Azure — you must call validateAndConfirmUpload after */
    requiresValidation?: boolean;
}

export type PresignedViewUrlResult =
    | PresignedViewUrlSuccess
    | PresignedUrlError;

export interface PresignedViewUrlSuccess extends PresignedUrlSuccess {
    reference: string;
    viewUrl: string;
    expiresIn: number;
}

export type BlobValidationResult = BlobValidationSuccess | BlobValidationError;

export interface BlobValidationSuccess {
    success: true;
    /** The file reference that was validated */
    reference: string;
    /** URL to view the file */
    viewUrl?: string;
    /** What the file's content type actually is */
    actualContentType?: string;
    /** What the file's size actually is */
    actualFileSize?: number;
    /** How long the view URL is valid */
    expiresIn?: number;
}

export interface BlobValidationError {
    success: false;
    /** What went wrong */
    error: string;
    /** Programmatic error code */
    code: StorageErrorCode;
    /** Actual content type (for diagnostic purposes) */
    actualContentType?: string;
    /** Actual file size (for diagnostic purposes) */
    actualFileSize?: number;
}

export type ListFilesResult = ListFilesSuccess | ListFilesError;

export interface ListFilesSuccess {
    success: true;
    /** The files found */
    files: FileInfo[];
    /** Token for getting the next page of results */
    nextToken?: string;
}

export interface ListFilesError {
    success: false;
    /** What went wrong */
    error: string;
    /** Programmatic error code */
    code: StorageErrorCode;
}

export interface BlobValidationOptions {
    /** The content type you're expecting */
    expectedContentType?: string;
    /** The file size you're expecting (in bytes) */
    expectedFileSize?: number;
    /** Delete the file if validation fails (default: true) */
    deleteOnFailure?: boolean;
}

export interface FileValidationOptions {
    /** Maximum file size in bytes */
    maxSize?: number;
    /** Allowed MIME types (e.g., ['image/jpeg', 'image/png']) */
    allowedMimeTypes?: string[];
    /** Allowed extensions (e.g., ['.jpg', '.png'] or ['jpg', 'png']) */
    allowedExtensions?: string[];
}

export interface UploadOptions {
    /** Override the detected content type */
    contentType?: string;
    /** Custom metadata (key-value pairs stored with the file) */
    metadata?: Record<string, string>;
    /** Cache-Control header (e.g., 'max-age=31536000') */
    cacheControl?: string;
    /** Content-Disposition header (e.g., 'attachment; filename="file.pdf"') */
    contentDisposition?: string;
    /** AbortSignal to cancel an in-flight upload */
    signal?: AbortSignal | undefined;
}

export interface FileMetadata {
    /** The filename */
    fileName: string;
    /** MIME type (e.g., 'image/jpeg') */
    contentType?: string;
    /** File size in bytes */
    fileSize?: number;
}

export interface HookErrorContext {
    operation: "upload" | "uploadMultiple" | "delete" | "deleteMultiple";
    file?: StorageFile;
    reference?: string;
}

export interface StorageHooks {
    /** Called before each file upload. Throw to abort. */
    beforeUpload?: (
        file: StorageFile,
        options?: UploadOptions,
    ) => void | Promise<void>;
    /** Called after each file upload (success or failure). */
    afterUpload?: (
        result: FileUploadResult,
        file: StorageFile,
    ) => void | Promise<void>;
    /** Called before each file deletion. Throw to abort. */
    beforeDelete?: (reference: string) => void | Promise<void>;
    /** Called after each file deletion. */
    afterDelete?: (reference: string, success: boolean) => void | Promise<void>;
    /** Called when any operation encounters an error. */
    onError?: (error: Error, context: HookErrorContext) => void | Promise<void>;
}

export interface RateLimiterAdapter {
    /** Check if a request is allowed and record it if so. */
    tryAcquire(): boolean | Promise<boolean>;
    /** Get the number of remaining requests in the current window. */
    getRemainingRequests(): number | Promise<number>;
    /** Get the time until the rate limit resets (in ms). */
    getResetTime(): number | Promise<number>;
}

export interface RateLimitOptions {
    /** Maximum number of presigned URLs that can be generated per window */
    maxRequests: number;
    /** Time window in milliseconds (default: 60000 = 1 minute) */
    windowMs?: number;
}

export interface Logger {
    debug: (message: string, ...args: unknown[]) => void;
    info: (message: string, ...args: unknown[]) => void;
    warn: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
}

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

export interface StorageOptions {
    /** Which storage driver to use. Defaults to FILE_DRIVER or `local`. */
    driver?: StorageDriver;
    /** Credentials and settings (optional — can come from env vars) */
    credentials?: StorageCredentials;
    /** Your logger (optional — silent by default) */
    logger?: Logger;
    rateLimiter?: RateLimitOptions | RateLimiterAdapter;
    /** Lifecycle hooks (optional) */
    hooks?: StorageHooks;
    /** Maximum parallel operations for batch methods (default: 10) */
    concurrency?: number;
}

export interface BatchOptions {
    /** AbortSignal to cancel the batch operation mid-flight. */
    signal?: AbortSignal | undefined;
}

export interface PublicStorageConfig {
    driver: StorageDriver;
    bucketName?: string | undefined;
    bucketPath?: string | undefined;
    localPath?: string | undefined;
    presignedUrlExpiry?: number | undefined;
    maxFileSize?: number | undefined;
    awsRegion?: string | undefined;
    gcsProjectId?: string | undefined;
    azureAccountName?: string | undefined;
    azureContainerName?: string | undefined;
}

export interface StorageConfig extends PublicStorageConfig {
    awsAccessKey?: string | undefined;
    awsSecretKey?: string | undefined;
    gcsCredentials?: string | undefined;
    azureConnectionString?: string | undefined;
    azureAccountKey?: string | undefined;
}

export interface FileInfo {
    /** File path/name */
    name: string;
    /** File size in bytes */
    size?: number;
    /** MIME type */
    contentType?: string;
    /** When the file was last modified */
    lastModified?: Date;
    /** Custom key-value metadata stored with the file (local sidecar / cloud object metadata) */
    metadata?: Record<string, string>;
}

export interface StorageFile {
    originalname: string;
    mimetype: string;
    size: number;
    buffer?: Buffer;
    path?: string;
}

export interface IStorageDriver {
    upload(
        file: StorageFile,
        options?: UploadOptions,
    ): Promise<FileUploadResult>;
    generateUploadUrl(
        fileName: string,
        contentType?: string,
        fileSize?: number,
    ): Promise<PresignedUrlResult>;
    generateViewUrl(fileName: string): Promise<PresignedUrlResult>;
    delete(fileName: string): Promise<DeleteResult>;
    validateAndConfirmUpload(
        reference: string,
        options?: BlobValidationOptions,
    ): Promise<BlobValidationResult>;
    listFiles(
        prefix?: string,
        maxResults?: number,
        continuationToken?: string,
    ): Promise<ListFilesResult>;
    getMetadata(reference: string): Promise<FileInfo | null>;
    /** Releases SDK client connections and internal resources. */
    destroy(): void;
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
}
