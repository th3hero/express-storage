# Express Storage

**Secure, unified file uploads for Express.js — one API for all cloud providers.**

Stop writing separate upload code for every storage provider. Express Storage gives you a single, secure interface that works with AWS S3, Google Cloud Storage, Azure Blob Storage, and local disk. Switch providers by changing one environment variable. No code changes required.

[![npm version](https://img.shields.io/npm/v/express-storage.svg)](https://www.npmjs.com/package/express-storage)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

---

## Why Express Storage?

Every application needs file uploads. And every application gets it wrong at first.

You start with local storage, then realize you need S3 for production. You copy-paste upload code from Stack Overflow, then discover it's vulnerable to path traversal attacks. You build presigned URL support, then learn Azure handles it completely differently than AWS.

**Express Storage solves these problems once, so you don't have to.**

### What Makes It Different

- **One API, Four Providers** — Write upload code once. Deploy to any cloud.
- **Security Built In** — Path traversal prevention, filename sanitization, file validation, and null byte protection come standard.
- **Presigned URLs Done Right** — Client-side uploads that bypass your server, with proper validation for each provider's quirks.
- **TypeScript Native** — Full type safety with intelligent autocomplete. No `any` types hiding bugs.
- **Zero Config Switching** — Change `FILE_DRIVER=local` to `FILE_DRIVER=s3` and you're done.

---

## Quick Start

### Installation

```bash
npm install express-storage
```

### Basic Setup

```typescript
import express from 'express';
import multer from 'multer';
import { StorageManager } from 'express-storage';

const app = express();
const upload = multer();
const storage = new StorageManager();

app.post('/upload', upload.single('file'), async (req, res) => {
  const result = await storage.uploadFile(req.file, {
    maxSize: 10 * 1024 * 1024, // 10MB limit
    allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf']
  });
  
  if (result.success) {
    res.json({ url: result.fileUrl });
  } else {
    res.status(400).json({ error: result.error });
  }
});
```

### Environment Configuration

Create a `.env` file:

```env
# Choose your storage provider
FILE_DRIVER=local

# For local storage
LOCAL_PATH=uploads

# For AWS S3
FILE_DRIVER=s3
BUCKET_NAME=my-bucket
AWS_REGION=us-east-1
AWS_ACCESS_KEY=your-key
AWS_SECRET_KEY=your-secret

# For Google Cloud Storage
FILE_DRIVER=gcs
BUCKET_NAME=my-bucket
GCS_PROJECT_ID=my-project

# For Azure Blob Storage
FILE_DRIVER=azure
AZURE_CONNECTION_STRING=your-connection-string
AZURE_CONTAINER_NAME=my-container
```

That's it. Your upload code stays the same regardless of which provider you choose.

---

## Supported Storage Providers

| Provider | Direct Upload | Presigned URLs | Best For |
|----------|--------------|----------------|----------|
| **Local Disk** | `local` | — | Development, small apps |
| **AWS S3** | `s3` | `s3-presigned` | Most production apps |
| **Google Cloud** | `gcs` | `gcs-presigned` | GCP-hosted applications |
| **Azure Blob** | `azure` | `azure-presigned` | Azure-hosted applications |

---

## Security Features

File uploads are one of the most exploited attack vectors in web applications. Express Storage protects you by default.

### Path Traversal Prevention

Attackers try filenames like `../../../etc/passwd` to escape your upload directory. We block this:

```typescript
// These malicious filenames are automatically rejected
"../secret.txt"     // Blocked: path traversal
"..\\config.json"   // Blocked: Windows path traversal  
"file\0.txt"        // Blocked: null byte injection
```

### Automatic Filename Sanitization

User-provided filenames can't be trusted. We transform them into safe, unique identifiers:

```
User uploads: "My Photo (1).jpg"
Stored as:    "1706123456789_a1b2c3d4e5_my_photo_1_.jpg"
```

The format `{timestamp}_{random}_{sanitized_name}` prevents collisions and removes dangerous characters.

### File Validation

Validate before processing. Reject before storing.

```typescript
await storage.uploadFile(file, {
  maxSize: 5 * 1024 * 1024,              // 5MB limit
  allowedMimeTypes: ['image/jpeg', 'image/png'],
  allowedExtensions: ['.jpg', '.png']
});
```

### Presigned URL Security

For S3 and GCS, file constraints are enforced at the URL level — clients physically cannot upload the wrong file type or size. For Azure (which doesn't support URL-level constraints), we validate after upload and automatically delete invalid files.

---

## Presigned URLs: Client-Side Uploads

Large files shouldn't flow through your server. Presigned URLs let clients upload directly to cloud storage.

### The Flow

```
1. Client → Your Server: "I want to upload photo.jpg (2MB, image/jpeg)"
2. Your Server → Client: "Here's a presigned URL, valid for 10 minutes"
3. Client → Cloud Storage: Uploads directly (your server never touches the bytes)
4. Client → Your Server: "Upload complete, please verify"
5. Your Server: Confirms file exists, returns permanent URL
```

### Implementation

```typescript
// Step 1: Generate upload URL
app.post('/upload/init', async (req, res) => {
  const { fileName, contentType, fileSize } = req.body;
  
  const result = await storage.generateUploadUrl(
    fileName,
    contentType,
    fileSize,
    'user-uploads'  // Optional folder
  );
  
  res.json({
    uploadUrl: result.uploadUrl,
    reference: result.reference  // Save this for later
  });
});

// Step 2: Confirm upload
app.post('/upload/confirm', async (req, res) => {
  const { reference, expectedContentType, expectedFileSize } = req.body;
  
  const result = await storage.validateAndConfirmUpload(reference, {
    expectedContentType,
    expectedFileSize
  });
  
  if (result.success) {
    res.json({ viewUrl: result.viewUrl });
  } else {
    res.status(400).json({ error: result.error });
  }
});
```

### Provider-Specific Behavior

| Provider | Content-Type Enforced | File Size Enforced | Post-Upload Validation |
|----------|----------------------|-------------------|----------------------|
| S3 | At URL level | At URL level | Optional |
| GCS | At URL level | At URL level | Optional |
| Azure | **Not enforced** | **Not enforced** | **Required** |

For Azure, always call `validateAndConfirmUpload()` with expected values. Invalid files are automatically deleted.

---

## Large File Uploads

For files larger than 100MB, we recommend using **presigned URLs** instead of direct server uploads. Here's why:

### Memory Efficiency

When you upload through your server, the entire file must be buffered in memory (or stored temporarily on disk). For a 500MB video file, that's 500MB of RAM per concurrent upload. With presigned URLs, the file goes directly to cloud storage — your server only handles small JSON requests.

### Automatic Streaming

For files that must go through your server, Express Storage automatically uses streaming uploads for files larger than 100MB:

- **S3**: Uses multipart upload with 10MB chunks
- **GCS**: Uses resumable uploads with streaming
- **Azure**: Uses block upload with streaming

This happens transparently — you don't need to change your code.

### Recommended Approach for Large Files

```typescript
// Frontend: Request presigned URL
const { uploadUrl, reference } = await fetch('/api/upload/init', {
  method: 'POST',
  body: JSON.stringify({
    fileName: 'large-video.mp4',
    contentType: 'video/mp4',
    fileSize: 524288000  // 500MB
  })
}).then(r => r.json());

// Frontend: Upload directly to cloud (bypasses your server!)
await fetch(uploadUrl, {
  method: 'PUT',
  body: file,
  headers: { 'Content-Type': 'video/mp4' }
});

// Frontend: Confirm upload
await fetch('/api/upload/confirm', {
  method: 'POST',
  body: JSON.stringify({ reference })
});
```

### Size Limits

| Scenario | Recommended Limit | Reason |
|----------|------------------|--------|
| Direct upload (memory storage) | < 100MB | Node.js memory constraints |
| Direct upload (disk storage) | < 500MB | Temp file management |
| Presigned URL upload | 5GB+ | Limited only by cloud provider |

---

## API Reference

### StorageManager

The main class you'll interact with.

```typescript
import { StorageManager } from 'express-storage';

// Use environment variables
const storage = new StorageManager();

// Or configure programmatically
const storage = new StorageManager({
  driver: 's3',
  credentials: {
    bucketName: 'my-bucket',
    awsRegion: 'us-east-1',
    maxFileSize: 50 * 1024 * 1024  // 50MB
  },
  logger: console  // Optional: enable debug logging
});
```

### File Upload Methods

```typescript
// Single file
const result = await storage.uploadFile(file, validation?, options?);

// Multiple files (processed in parallel with concurrency limits)
const results = await storage.uploadFiles(files, validation?, options?);

// Generic upload (auto-detects single vs multiple)
const result = await storage.upload(input, validation?, options?);
```

### Presigned URL Methods

```typescript
// Generate upload URL with constraints
const result = await storage.generateUploadUrl(fileName, contentType?, fileSize?, folder?);

// Generate view URL for existing file
const result = await storage.generateViewUrl(reference);

// Validate upload (required for Azure, recommended for all)
const result = await storage.validateAndConfirmUpload(reference, options?);

// Batch operations
const results = await storage.generateUploadUrls(files, folder?);
const results = await storage.generateViewUrls(references);
```

### File Management

```typescript
// Delete single file
const success = await storage.deleteFile(reference);

// Delete multiple files
const results = await storage.deleteFiles(references);

// List files with pagination
const result = await storage.listFiles(prefix?, maxResults?, continuationToken?);
```

### Upload Options

```typescript
interface UploadOptions {
  contentType?: string;              // Override detected type
  metadata?: Record<string, string>; // Custom metadata
  cacheControl?: string;             // e.g., 'max-age=31536000'
  contentDisposition?: string;       // e.g., 'attachment; filename="doc.pdf"'
}

// Example: Upload with caching headers
await storage.uploadFile(file, undefined, {
  cacheControl: 'public, max-age=31536000',
  metadata: { uploadedBy: 'user-123' }
});
```

### Validation Options

```typescript
interface FileValidationOptions {
  maxSize?: number;           // Maximum file size in bytes
  allowedMimeTypes?: string[];  // e.g., ['image/jpeg', 'image/png']
  allowedExtensions?: string[]; // e.g., ['.jpg', '.png']
}
```

---

## Environment Variables

### Core Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `FILE_DRIVER` | Storage driver to use | `local` |
| `BUCKET_NAME` | Cloud storage bucket/container name | — |
| `BUCKET_PATH` | Default folder path within bucket | `""` (root) |
| `LOCAL_PATH` | Directory for local storage | `public/express-storage` |
| `PRESIGNED_URL_EXPIRY` | URL validity in seconds | `600` (10 min) |
| `MAX_FILE_SIZE` | Maximum upload size in bytes | `5368709120` (5GB) |

### AWS S3

| Variable | Description |
|----------|-------------|
| `AWS_REGION` | AWS region (e.g., `us-east-1`) |
| `AWS_ACCESS_KEY` | Access key ID (optional if using IAM roles) |
| `AWS_SECRET_KEY` | Secret access key (optional if using IAM roles) |

### Google Cloud Storage

| Variable | Description |
|----------|-------------|
| `GCS_PROJECT_ID` | Google Cloud project ID |
| `GCS_CREDENTIALS` | Path to service account JSON (optional with ADC) |

### Azure Blob Storage

| Variable | Description |
|----------|-------------|
| `AZURE_CONNECTION_STRING` | Full connection string (recommended) |
| `AZURE_ACCOUNT_NAME` | Storage account name (alternative) |
| `AZURE_ACCOUNT_KEY` | Storage account key (alternative) |
| `AZURE_CONTAINER_NAME` | Container name (falls back to `BUCKET_NAME`) |

---

## Utilities

Express Storage includes battle-tested utilities you can use directly.

### Retry with Exponential Backoff

```typescript
import { withRetry } from 'express-storage';

const result = await withRetry(
  () => storage.uploadFile(file),
  {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    exponentialBackoff: true
  }
);
```

### File Type Helpers

```typescript
import { 
  isImageFile, 
  isDocumentFile, 
  getFileExtension,
  formatFileSize 
} from 'express-storage';

isImageFile('image/jpeg');        // true
isDocumentFile('application/pdf'); // true
getFileExtension('photo.jpg');     // '.jpg'
formatFileSize(1048576);           // '1 MB'
```

### Custom Logging

```typescript
import { StorageManager, Logger } from 'express-storage';

const logger: Logger = {
  debug: (msg, ...args) => console.debug(`[Storage] ${msg}`, ...args),
  info: (msg, ...args) => console.info(`[Storage] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[Storage] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[Storage] ${msg}`, ...args),
};

const storage = new StorageManager({ driver: 's3', logger });
```

---

## Real-World Examples

### Profile Picture Upload

```typescript
app.post('/users/:id/avatar', upload.single('avatar'), async (req, res) => {
  const result = await storage.uploadFile(req.file, {
    maxSize: 2 * 1024 * 1024,  // 2MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
  }, {
    cacheControl: 'public, max-age=86400',
    metadata: { userId: req.params.id }
  });
  
  if (result.success) {
    await db.users.update(req.params.id, { avatarUrl: result.fileUrl });
    res.json({ avatarUrl: result.fileUrl });
  } else {
    res.status(400).json({ error: result.error });
  }
});
```

### Document Upload with Presigned URLs

```typescript
// Frontend requests upload URL
app.post('/documents/request-upload', async (req, res) => {
  const { fileName, fileSize } = req.body;
  
  const result = await storage.generateUploadUrl(
    fileName,
    'application/pdf',
    fileSize,
    `documents/${req.user.id}`
  );
  
  // Store pending upload in database
  await db.documents.create({
    reference: result.reference,
    userId: req.user.id,
    status: 'pending'
  });
  
  res.json({
    uploadUrl: result.uploadUrl,
    reference: result.reference
  });
});

// Frontend confirms upload complete
app.post('/documents/confirm-upload', async (req, res) => {
  const { reference } = req.body;
  
  const result = await storage.validateAndConfirmUpload(reference, {
    expectedContentType: 'application/pdf'
  });
  
  if (result.success) {
    await db.documents.update({ reference }, { 
      status: 'uploaded',
      size: result.actualFileSize 
    });
    res.json({ success: true, viewUrl: result.viewUrl });
  } else {
    await db.documents.delete({ reference });
    res.status(400).json({ error: result.error });
  }
});
```

### Bulk File Upload

```typescript
app.post('/gallery/upload', upload.array('photos', 20), async (req, res) => {
  const files = req.files as Express.Multer.File[];
  
  const results = await storage.uploadFiles(files, {
    maxSize: 10 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png']
  });
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  res.json({
    uploaded: successful.length,
    failed: failed.length,
    files: successful.map(r => ({ fileName: r.fileName, url: r.fileUrl })),
    errors: failed.map(r => r.error)
  });
});
```

---

## Migrating Between Providers

Moving from local development to cloud production? Or switching cloud providers? Here's how.

### Local to S3

```env
# Before (development)
FILE_DRIVER=local
LOCAL_PATH=uploads

# After (production)
FILE_DRIVER=s3
BUCKET_NAME=my-app-uploads
AWS_REGION=us-east-1
```

Your code stays exactly the same. Files uploaded before migration remain in their original location — you'll need to migrate existing files separately if needed.

### S3 to Azure

```env
# Before
FILE_DRIVER=s3
BUCKET_NAME=my-bucket
AWS_REGION=us-east-1

# After
FILE_DRIVER=azure
AZURE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...
AZURE_CONTAINER_NAME=my-container
```

**Important**: If using presigned URLs, remember that Azure requires post-upload validation. Add `validateAndConfirmUpload()` calls to your confirmation endpoints.

---

## TypeScript Support

Express Storage is written in TypeScript and exports all types:

```typescript
import { 
  StorageManager,
  StorageDriver,
  FileUploadResult,
  PresignedUrlResult,
  FileValidationOptions,
  UploadOptions,
  Logger
} from 'express-storage';

// Full autocomplete and type checking
const result: FileUploadResult = await storage.uploadFile(file);

if (result.success) {
  console.log(result.fileName);  // TypeScript knows this exists
  console.log(result.fileUrl);   // TypeScript knows this exists
}
```

---

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting a pull request.

```bash
# Clone the repository
git clone https://github.com/th3hero/express-storage.git

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Run linting
npm run lint
```

---

## License

MIT License — use it however you want.

---

## Support

- **Issues**: [GitHub Issues](https://github.com/th3hero/express-storage/issues)
- **Author**: Alok Kumar ([@th3hero](https://github.com/th3hero))

---

**Made for developers who are tired of writing upload code from scratch.**
