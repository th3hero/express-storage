import {
    StorageManager,
    StorageDriver,
    FileValidationOptions,
} from "./src/index.js";

/**
 * Parse environment variable as integer with fallback
 * Returns undefined if value is not a valid number (lets StorageManager use defaults)
 */
function parseEnvInt(
    value: string | undefined,
    fallback?: number,
): number | undefined {
    if (!value) return fallback;
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed)) {
        console.warn(
            `Warning: Invalid numeric value "${value}", using default`,
        );
        return fallback;
    }
    return parsed;
}

/**
 * Example: Initialize storage with environment variables
 * This allows switching storage providers without code changes
 */
const storage = new StorageManager({
    driver: (process.env["FILE_DRIVER"] as StorageDriver) || "local",
    credentials: {
        // Common
        bucketName: process.env["BUCKET_NAME"],
        localPath: process.env["LOCAL_PATH"] || "public/express-storage",
        presignedUrlExpiry: parseEnvInt(
            process.env["PRESIGNED_URL_EXPIRY"],
            600,
        ),

        // AWS S3
        awsRegion: process.env["AWS_REGION"],
        awsAccessKey: process.env["AWS_ACCESS_KEY"],
        awsSecretKey: process.env["AWS_SECRET_KEY"],

        // Google Cloud Storage
        gcsProjectId: process.env["GCS_PROJECT_ID"],
        gcsCredentials: process.env["GCS_CREDENTIALS"],

        // Azure Blob Storage
        azureConnectionString: process.env["AZURE_CONNECTION_STRING"],
        azureAccountName: process.env["AZURE_ACCOUNT_NAME"],
        azureAccountKey: process.env["AZURE_ACCOUNT_KEY"],
        azureContainerName: process.env["BUCKET_NAME"],
    },
});

/**
 * Example: Upload a file with validation
 */
async function uploadWithValidation(file: Express.Multer.File) {
    const validation: FileValidationOptions = {
        maxSize: 5 * 1024 * 1024, // 5MB
        allowedMimeTypes: ["image/jpeg", "image/png", "image/gif"],
        allowedExtensions: [".jpg", ".jpeg", ".png", ".gif"],
    };

    const result = await storage.uploadFile(file, validation);

    if (result.success) {
        console.log("File uploaded:", result.fileName, result.fileUrl);
    } else {
        console.error("Upload failed:", result.error);
    }

    return result;
}

/**
 * Example: Generate presigned URL for frontend upload
 * The URL can have content type constraints
 */
async function getPresignedUploadUrl(fileName: string) {
    const result = await storage.generateUploadUrl(
        fileName,
        "image/jpeg", // Content type constraint
        5 * 1024 * 1024, // Max size hint (for client-side validation)
    );

    if (result.success) {
        console.log("Presigned URL generated:", {
            uploadUrl: result.uploadUrl,
            fileName: result.fileName,
            contentType: result.contentType,
            fileSize: result.fileSize,
            expiresIn: result.expiresIn,
        });
    }

    return result;
}

/**
 * Example: Generate view URL for private files
 */
async function getViewUrl(fileName: string) {
    const result = await storage.generateViewUrl(fileName);

    if (result.success) {
        console.log("View URL:", result.viewUrl);
    }

    return result;
}

/**
 * Example: Delete a file
 */
async function removeFile(fileName: string) {
    const deleted = await storage.deleteFile(fileName);
    console.log("File deleted:", deleted);
    return deleted;
}

// Export for use in Express routes
export {
    storage,
    uploadWithValidation,
    getPresignedUploadUrl,
    getViewUrl,
    removeFile,
};
