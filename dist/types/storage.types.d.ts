export type StorageDriver = 's3' | 's3-presigned' | 'gcs' | 'gcs-presigned' | 'azure' | 'azure-presigned' | 'local';
export interface FileUploadResult {
    success: boolean;
    fileName?: string;
    fileUrl?: string;
    error?: string;
}
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
export interface FileValidationOptions {
    maxSize?: number;
    allowedMimeTypes?: string[];
    allowedExtensions?: string[];
}
export interface StorageCredentials {
    bucketName?: string;
    localPath?: string;
    presignedUrlExpiry?: number;
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
export interface StorageOptions {
    driver: StorageDriver;
    credentials?: StorageCredentials;
}
export interface StorageConfig {
    driver: StorageDriver;
    bucketName?: string | undefined;
    localPath?: string | undefined;
    presignedUrlExpiry?: number | undefined;
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
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
}
export interface EnvironmentConfig {
    FILE_DRIVER: string;
    BUCKET_NAME?: string | undefined;
    LOCAL_PATH?: string | undefined;
    PRESIGNED_URL_EXPIRY?: string | undefined;
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