# Express Storage

A powerful, TypeScript-first file upload and storage management package for Express.js applications. Supports multiple cloud storage providers with a simple, unified API.

## 🚀 Features

- **TypeScript First**: Fully written in TypeScript with complete type definitions
- **Multiple Storage Drivers**: Support for AWS S3, Google Cloud Storage, Oracle Cloud Infrastructure, and local storage
- **Presigned URLs**: Generate secure, time-limited URLs for direct client uploads
- **Flexible File Handling**: Support for single and multiple file uploads
- **Automatic File Organization**: Files stored in month/year directories for local storage
- **Unique File Naming**: Unix timestamp-based unique filenames with sanitization
- **Environment-based Configuration**: Simple setup using environment variables
- **Class-based API**: Clean, object-oriented interface with `StorageManager`
- **Comprehensive Testing**: Full test coverage with Jest
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
FILE_DRIVER=s3
BUCKET_NAME=my-bucket
AWS_REGION=us-east-1
AWS_ACCESS_KEY=your-access-key
AWS_SECRET_KEY=your-secret-key

# Optional: Presigned URL expiry (default: 600 seconds / 10 minutes)
PRESIGNED_URL_EXPIRY=600
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
  try {
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
  } catch (error) {
    res.status(500).json({ success: false, error: 'Upload failed' });
  }
});

// Multiple files upload
app.post('/upload-multiple', upload.array('files', 10), async (req, res) => {
  try {
    const results = await storage.uploadFiles(req.files as Express.Multer.File[]);
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    res.json({
      success: true,
      uploaded: successful.length,
      failed: failed.length,
      results
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Upload failed' });
  }
});
```

## 🗂️ Supported Storage Drivers

| Driver | Type | Description | Required Environment Variables |
|--------|------|-------------|-------------------------------|
| `local` | Direct | Local file system storage | `LOCAL_PATH` (optional) |
| `s3` | Direct | AWS S3 direct upload | `BUCKET_NAME`, `AWS_REGION`, `AWS_ACCESS_KEY`, `AWS_SECRET_KEY` |
| `s3-presigned` | Presigned | AWS S3 presigned URLs | `BUCKET_NAME`, `AWS_REGION`, `AWS_ACCESS_KEY`, `AWS_SECRET_KEY` |
| `gcs` | Direct | Google Cloud Storage direct upload | `BUCKET_NAME`, `GCS_PROJECT_ID`, `GCS_CREDENTIALS` |
| `gcs-presigned` | Presigned | Google Cloud Storage presigned URLs | `BUCKET_NAME`, `GCS_PROJECT_ID`, `GCS_CREDENTIALS` |
| `oci` | Direct | Oracle Cloud Infrastructure direct upload | `BUCKET_NAME`, `OCI_REGION`, `OCI_CREDENTIALS` |
| `oci-presigned` | Presigned | Oracle Cloud Infrastructure presigned URLs | `BUCKET_NAME`, `OCI_REGION`, `OCI_CREDENTIALS` |

## 📋 Environment Variables Reference

### Core Configuration
- `FILE_DRIVER` (required): Storage driver to use
- `BUCKET_NAME`: Cloud storage bucket name
- `LOCAL_PATH`: Local storage directory path (default: `public/express-storage`)
- `PRESIGNED_URL_EXPIRY`: Presigned URL expiry in seconds (default: 600)

### AWS S3 Configuration
- `AWS_REGION`: AWS region (e.g., `us-east-1`)
- `AWS_ACCESS_KEY`: AWS access key ID
- `AWS_SECRET_KEY`: AWS secret access key

### Google Cloud Storage Configuration
- `GCS_PROJECT_ID`: Google Cloud project ID
- `GCS_CREDENTIALS`: Path to service account JSON file

### Oracle Cloud Infrastructure Configuration
- `OCI_REGION`: OCI region (e.g., `us-ashburn-1`)
- `OCI_CREDENTIALS`: Path to OCI credentials file

## 🔌 API Reference

### StorageManager Class

The main class for managing file storage operations.

#### Constructor
```typescript
const storage = new StorageManager();
```

#### Methods

##### File Upload
```typescript
// Single file upload
const result = await storage.uploadFile(file: Express.Multer.File): Promise<FileUploadResult>

// Multiple files upload
const results = await storage.uploadFiles(files: Express.Multer.File[]): Promise<FileUploadResult[]>

// Generic upload (handles both single and multiple)
const result = await storage.upload(input: FileInput): Promise<FileUploadResult | FileUploadResult[]>
```

##### Presigned URLs
```typescript
// Generate upload URL
const result = await storage.generateUploadUrl(fileName: string): Promise<PresignedUrlResult>

// Generate view URL
const result = await storage.generateViewUrl(fileName: string): Promise<PresignedUrlResult>

// Generate multiple upload URLs
const results = await storage.generateUploadUrls(fileNames: string[]): Promise<PresignedUrlResult[]>

// Generate multiple view URLs
const results = await storage.generateViewUrls(fileNames: string[]): Promise<PresignedUrlResult[]>
```

##### File Deletion
```typescript
// Delete single file
const success = await storage.deleteFile(fileName: string): Promise<boolean>

// Delete multiple files
const results = await storage.deleteFiles(fileNames: string[]): Promise<boolean[]>
```

##### Utility Methods
```typescript
// Get current configuration
const config = storage.getConfig(): StorageConfig

// Get driver type
const driverType = storage.getDriverType(): string

// Check if presigned URLs are supported
const isSupported = storage.isPresignedSupported(): boolean
```

### Static Methods

```typescript
// Initialize with custom configuration
const storage = StorageManager.initialize({
  driver: 's3',
  bucketName: 'my-bucket',
  awsRegion: 'us-east-1'
});

// Get available drivers
const drivers = StorageManager.getAvailableDrivers(): string[]

// Clear driver cache
StorageManager.clearCache(): void
```

### Convenience Functions

```typescript
import { 
  uploadFile, 
  uploadFiles, 
  generateUploadUrl, 
  generateViewUrl,
  deleteFile,
  deleteFiles,
  getStorageManager,
  initializeStorageManager
} from 'express-storage';

// Use default storage manager
const result = await uploadFile(file);
const results = await uploadFiles(files);
const urlResult = await generateUploadUrl('filename.jpg');
const success = await deleteFile('filename.jpg');

// Initialize custom storage manager
const storage = initializeStorageManager({
  driver: 'local',
  localPath: 'uploads'
});
```

## 📁 File Organization

### Local Storage
Files are organized in month/year directories:
```
public/express-storage/
├── january/
│   └── 2024/
│       ├── 1703123456_image.jpg
│       └── 1703123457_document.pdf
├── february/
│   └── 2024/
│       └── 1705800000_video.mp4
└── ...
```

### Cloud Storage
Files are stored with unique timestamps:
```
bucket/
├── 1703123456_image.jpg
├── 1703123457_document.pdf
└── 1705800000_video.mp4
```

## 🔐 Presigned URLs

For cloud storage providers, you can generate presigned URLs for secure, direct client uploads:

```typescript
// Generate upload URL for client-side upload
const uploadResult = await storage.generateUploadUrl('my-file.jpg');
if (uploadResult.success) {
  // Client can use uploadResult.uploadUrl to upload directly
  console.log(uploadResult.uploadUrl);
}

// Generate view URL for secure file access
const viewResult = await storage.generateViewUrl('my-file.jpg');
if (viewResult.success) {
  // Client can use viewResult.viewUrl to view the file
  console.log(viewResult.viewUrl);
}
```

## 🛠️ Advanced Usage Examples

### Custom Configuration

```typescript
import { StorageManager } from 'express-storage';

// Initialize with custom config
const storage = StorageManager.initialize({
  driver: 's3',
  bucketName: 'my-bucket',
  awsRegion: 'us-east-1',
  awsAccessKey: process.env.AWS_ACCESS_KEY,
  awsSecretKey: process.env.AWS_SECRET_KEY,
  presignedUrlExpiry: 1800 // 30 minutes
});
```

### Error Handling

```typescript
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const result = await storage.uploadFile(req.file!);
    
    if (result.success) {
      res.json({
        success: true,
        fileName: result.fileName,
        fileUrl: result.fileUrl
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
```

### File Validation

```typescript
app.post('/upload', upload.single('file'), async (req, res) => {
  const file = req.file!;
  
  // Validate file size (5MB limit)
  if (file.size > 5 * 1024 * 1024) {
    return res.status(400).json({
      success: false,
      error: 'File size too large. Maximum 5MB allowed.'
    });
  }
  
  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
  if (!allowedTypes.includes(file.mimetype)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid file type. Only JPEG, PNG, and GIF allowed.'
    });
  }
  
  const result = await storage.uploadFile(file);
  res.json(result);
});
```

### Multiple File Upload with Progress

```typescript
app.post('/upload-multiple', upload.array('files', 10), async (req, res) => {
  const files = req.files as Express.Multer.File[];
  const results = await storage.uploadFiles(files);
  
  const summary = {
    total: files.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    files: results.map((result, index) => ({
      originalName: files[index].originalname,
      success: result.success,
      fileName: result.fileName,
      fileUrl: result.fileUrl,
      error: result.error
    }))
  };
  
  res.json(summary);
});
```

## 🧪 Testing

Run the test suite:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## 🛠️ Development

### Prerequisites
- Node.js >= 16.0.0
- TypeScript >= 5.1.6

### Development Commands

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Development mode (watch for changes)
npm run dev

# Clean build directory
npm run clean

# Type checking
npm run type-check

# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format
```

### Project Structure

```
express-storage/
├── src/
│   ├── types/
│   │   └── storage.types.ts      # Type definitions
│   ├── utils/
│   │   ├── config.utils.ts       # Configuration utilities
│   │   └── file.utils.ts         # File operation utilities
│   ├── drivers/
│   │   ├── base.driver.ts        # Abstract base driver
│   │   ├── local.driver.ts       # Local storage driver
│   │   ├── s3.driver.ts          # AWS S3 driver
│   │   ├── gcs.driver.ts         # Google Cloud Storage driver
│   │   └── oci.driver.ts         # Oracle Cloud Infrastructure driver
│   ├── factory/
│   │   └── driver.factory.ts     # Driver factory
│   ├── storage-manager.ts        # Main StorageManager class
│   └── index.ts                  # Package entry point
├── tests/                        # Test files
├── examples/                     # Usage examples
├── dist/                         # Compiled output
└── package.json
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Write comprehensive tests for new features
- Update documentation for API changes
- Ensure all tests pass before submitting PR

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: Report bugs and feature requests on GitHub
- **Documentation**: Check the examples folder for usage patterns
- **Questions**: Open a GitHub discussion for questions

## 🔄 Changelog

### v1.0.0
- Initial release
- Support for local, S3, GCS, and OCI storage
- Presigned URL generation
- TypeScript-first implementation
- Comprehensive test coverage

---

**Made with ❤️ for the Express.js community**
