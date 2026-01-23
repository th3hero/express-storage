# Express Storage

A powerful, TypeScript-first file upload and storage management package for Express.js applications. Supports multiple cloud storage providers with a simple, unified API.

## 🚀 Features

- **TypeScript First**: Fully written in TypeScript with complete type definitions
- **Multiple Storage Drivers**: Support for AWS S3, Google Cloud Storage, Azure Blob Storage, and local storage
- **Presigned URLs**: Generate secure, time-limited URLs for direct client uploads
- **File Validation**: Built-in size, type, and extension validation with enforcement
- **Azure Post-Upload Validation**: Server-side validation for Azure (which doesn't support URL-level constraints)
- **Flexible File Handling**: Support for single and multiple file uploads with parallel processing
- **Custom Metadata**: Add custom metadata, cache-control, and content-disposition to uploads
- **Automatic File Organization**: Files stored with unique timestamp-based names
- **Environment-based Configuration**: Simple setup using environment variables
- **Configurable Limits**: Set max file size per instance
- **Retry Support**: Built-in retry utility with exponential backoff
- **List Files**: Query and paginate through stored files
- **Logging Support**: Inject custom logger for debugging and monitoring
- **Error Handling**: Consistent error responses with detailed messages

## 📦 Installation

```bash
npm install express-storage
```

## 🔧 Quick Setup

### 1. Environment Configuration

Create a `.env` file in your project root:

```env
# Required: Choose your storage driver
FILE_DRIVER=local

# For local storage (optional - defaults to public/express-storage)
LOCAL_PATH=public/uploads

# For cloud storage (AWS S3 example)
FILE_DRIVER=s3-presigned
BUCKET_NAME=my-bucket
BUCKET_PATH=uploads          # Optional: default folder path
AWS_REGION=us-east-1
AWS_ACCESS_KEY=your-access-key
AWS_SECRET_KEY=your-secret-key

# Optional settings
PRESIGNED_URL_EXPIRY=600     # URL expiry in seconds (default: 600)
MAX_FILE_SIZE=5368709120     # Max file size in bytes (default: 5GB)
```

### 2. Basic Usage

```typescript
import express from 'express';
import multer from 'multer';
import { StorageManager } from 'express-storage';

const app = express();
const upload = multer();

// Initialize storage manager
const storage = new StorageManager();

// Single file upload
app.post('/upload', upload.single('file'), async (req, res) => {
  const result = await storage.uploadFile(req.file!);
  
  if (result.success) {
    res.json({
      success: true,
      fileName: result.fileName,
      fileUrl: result.fileUrl
    });
  } else {
    res.status(400).json({ success: false, error: result.error });
  }
});
```

## 🗂️ Supported Storage Drivers

| Driver | Type | Description |
|--------|------|-------------|
| `local` | Direct | Local file system storage |
| `s3` | Direct | AWS S3 direct upload |
| `s3-presigned` | Presigned | AWS S3 presigned URLs |
| `gcs` | Direct | Google Cloud Storage direct upload |
| `gcs-presigned` | Presigned | Google Cloud Storage presigned URLs |
| `azure` | Direct | Azure Blob Storage direct upload |
| `azure-presigned` | Presigned | Azure Blob Storage presigned URLs |

## 📋 Environment Variables Reference

### Core Configuration
| Variable | Description | Default |
|----------|-------------|---------|
| `FILE_DRIVER` | Storage driver to use | `local` |
| `BUCKET_NAME` | Cloud storage bucket name | - |
| `BUCKET_PATH` | Default folder path in bucket | `` (root) |
| `LOCAL_PATH` | Local storage directory path | `public/express-storage` |
| `PRESIGNED_URL_EXPIRY` | URL expiry in seconds | `600` |
| `MAX_FILE_SIZE` | Maximum file size in bytes | `5368709120` (5GB) |

### AWS S3 Configuration
| Variable | Description |
|----------|-------------|
| `AWS_REGION` | AWS region (e.g., `us-east-1`) |
| `AWS_ACCESS_KEY` | AWS access key ID (optional on AWS with IAM) |
| `AWS_SECRET_KEY` | AWS secret access key (optional on AWS with IAM) |

### Google Cloud Storage Configuration
| Variable | Description |
|----------|-------------|
| `GCS_PROJECT_ID` | Google Cloud project ID |
| `GCS_CREDENTIALS` | Path to service account JSON file (optional on GCP with ADC) |

### Azure Blob Storage Configuration
| Variable | Description |
|----------|-------------|
| `AZURE_CONNECTION_STRING` | Connection string (recommended) |
| `AZURE_ACCOUNT_NAME` | Account name (alternative) |
| `AZURE_ACCOUNT_KEY` | Account key (alternative) |
| `AZURE_CONTAINER_NAME` | Container name (uses BUCKET_NAME if not set) |

## 🔐 Presigned URLs

Presigned URLs allow secure, direct client-to-cloud uploads without exposing credentials.

### Validation Behavior by Provider

| Provider | Content-Type | File Size | Post-Upload Validation |
|----------|--------------|-----------|------------------------|
| **S3** | ✅ Enforced | ✅ Enforced | Optional |
| **GCS** | ✅ Enforced | ✅ Enforced | Optional |
| **Azure** | ❌ Not enforced | ❌ Not enforced | **Required** |

### Presigned URL Flow

```typescript
// 1. Generate upload URL
const result = await storage.generateUploadUrl(
  'photo.jpg',           // Original filename
  'image/jpeg',          // Content type
  12345,                 // Exact file size in bytes
  'users/123/uploads'    // Optional folder (overrides BUCKET_PATH)
);

// Response includes:
// {
//   success: true,
//   fileName: '1769107318637_abc123_photo.jpg',  // Unique filename
//   filePath: 'users/123/uploads',               // Folder path
//   reference: 'users/123/uploads/1769107318637_abc123_photo.jpg',  // Full path for view/delete
//   uploadUrl: 'https://...',                    // Presigned upload URL
//   requiresValidation: true,                    // True for Azure
//   expiresIn: 600
// }

// 2. Client uploads directly to uploadUrl

// 3. Confirm and validate upload
const confirmResult = await storage.validateAndConfirmUpload(
  result.reference,
  {
    expectedContentType: 'image/jpeg',  // Required for Azure
    expectedFileSize: 12345             // Required for Azure
  }
);

// For Azure: validates blob properties and deletes if mismatch
// For S3/GCS: verifies file exists and returns metadata
```

## 🔌 API Reference

### StorageManager Class

#### Constructor
```typescript
const storage = new StorageManager({
  driver: 's3-presigned',
  credentials: {
    bucketName: 'my-bucket',
    bucketPath: 'uploads',
    awsRegion: 'us-east-1',
    maxFileSize: 10 * 1024 * 1024, // 10MB
  },
  logger: console, // Optional: inject custom logger
});
```

#### File Upload Methods

```typescript
// Single file upload with validation and metadata
const result = await storage.uploadFile(
  file,
  { maxSize: 5 * 1024 * 1024, allowedMimeTypes: ['image/jpeg'] },
  { metadata: { uploadedBy: 'user123' }, cacheControl: 'max-age=31536000' }
);

// Multiple files upload (parallel)
const results = await storage.uploadFiles(files, validation, uploadOptions);

// Generic upload
const result = await storage.upload(fileInput, validation, uploadOptions);
```

#### Presigned URL Methods

```typescript
// Generate upload URL
const result = await storage.generateUploadUrl(
  fileName,
  contentType,
  fileSize,
  folder  // Optional: overrides BUCKET_PATH
);

// Generate view URL
const result = await storage.generateViewUrl(reference);

// Validate and confirm upload (required for Azure)
const result = await storage.validateAndConfirmUpload(reference, {
  expectedContentType: 'image/jpeg',
  expectedFileSize: 12345,
});

// Multiple URLs
const results = await storage.generateUploadUrls(fileNames, folder);
const results = await storage.generateViewUrls(references);
```

#### File Management Methods

```typescript
// Delete file
const success = await storage.deleteFile(reference);

// Delete multiple files (parallel)
const results = await storage.deleteFiles(references);

// List files with pagination
const result = await storage.listFiles(
  'uploads/',           // Optional prefix
  100,                  // Max results (default: 1000)
  continuationToken     // For pagination
);
// Returns: { success, files: [{ name, size, contentType, lastModified }], nextToken }
```

#### Utility Methods

```typescript
storage.getConfig();                    // Get current configuration
storage.getDriverType();                // Get driver type
storage.isPresignedSupported();         // Check if presigned URLs supported
storage.requiresPostUploadValidation(); // True for Azure
StorageManager.getAvailableDrivers();   // List all drivers
StorageManager.clearCache();            // Clear driver cache
```

### Upload Options

```typescript
interface UploadOptions {
  contentType?: string;              // Override content type
  metadata?: Record<string, string>; // Custom metadata
  cacheControl?: string;             // Cache-Control header
  contentDisposition?: string;       // Content-Disposition header
}

// Example
await storage.uploadFile(file, undefined, {
  metadata: { 
    uploadedBy: 'user123',
    originalName: 'vacation-photo.jpg'
  },
  cacheControl: 'max-age=31536000, public',
  contentDisposition: 'inline; filename="photo.jpg"'
});
```

### Retry Utility

```typescript
import { withRetry } from 'express-storage';

// Retry cloud operations with exponential backoff
const result = await withRetry(
  () => storage.uploadFile(file),
  {
    maxRetries: 3,           // Default: 3
    baseDelay: 1000,         // Default: 1000ms
    maxDelay: 10000,         // Default: 10000ms
    exponentialBackoff: true // Default: true
  }
);
```

### Custom Logger

```typescript
import { StorageManager, Logger } from 'express-storage';

const customLogger: Logger = {
  debug: (msg, ...args) => console.debug(`[Storage] ${msg}`, ...args),
  info: (msg, ...args) => console.info(`[Storage] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[Storage] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[Storage] ${msg}`, ...args),
};

const storage = new StorageManager({
  driver: 's3-presigned',
  logger: customLogger,
});
```

## 📁 File Naming

Files are automatically renamed with a unique format to prevent collisions:

```
{timestamp}_{random}_{sanitized_name}.{extension}
```

Example: `1769104576000_a1b2c3_my_image.jpeg`

- **timestamp**: Unix timestamp in milliseconds
- **random**: 6-character random string
- **sanitized_name**: Original name with special characters replaced
- **extension**: Lowercase file extension

## 🔒 Security Best Practices

1. **Always validate on the server**: Even with presigned URL constraints, validate uploads
2. **Use short expiry times**: Keep presigned URLs valid only as long as needed
3. **Validate file types**: Use `allowedMimeTypes` and `allowedExtensions`
4. **Set size limits**: Configure `maxFileSize` appropriately
5. **For Azure**: Always use `validateAndConfirmUpload` with expected values

## 🛠️ Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Development mode
npm run dev

# Type checking
npm run type-check

# Linting
npm run lint
npm run lint:fix
```

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

**Made with ❤️ for the Express.js community**
