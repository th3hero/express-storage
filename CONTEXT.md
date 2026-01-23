# Express Storage - Project Context & Requirements

## Overview

A TypeScript-first file upload and storage management package for Express.js applications that provides a unified API across multiple cloud storage providers.

---

## Core Requirements

### 1. Storage Drivers

Must support the following drivers:
- `local` - Local file system storage
- `s3` - AWS S3 direct upload
- `s3-presigned` - AWS S3 presigned URLs
- `gcs` - Google Cloud Storage direct upload
- `gcs-presigned` - Google Cloud Storage presigned URLs
- `azure` - Azure Blob Storage direct upload
- `azure-presigned` - Azure Blob Storage presigned URLs

### 2. File Operations

Each driver must implement:
- `upload(file, options)` - Upload single file
- `uploadMultiple(files, options)` - Upload multiple files in parallel
- `delete(fileName)` - Delete single file
- `deleteMultiple(fileNames)` - Delete multiple files
- `listFiles(prefix, maxResults, token)` - List files with pagination
- `generateUploadUrl(fileName, contentType, fileSize)` - Generate presigned upload URL
- `generateViewUrl(fileName)` - Generate presigned view URL
- `generateMultipleUploadUrls(files)` - Generate multiple upload URLs
- `generateMultipleViewUrls(fileNames)` - Generate multiple view URLs
- `validateAndConfirmUpload(reference, options)` - Validate uploaded file (critical for Azure)

### 3. Multer Support

Must support both Multer storage configurations:
- Memory storage (`file.buffer`)
- Disk storage (`file.path`)

### 4. File Validation

StorageManager must validate:
- File size limits (`maxSize`)
- MIME type restrictions (`allowedMimeTypes`)
- File extension restrictions (`allowedExtensions`)

### 5. Security Requirements

- Prevent path traversal attacks (`..`)
- Sanitize filenames (remove special characters)
- Validate folder paths
- No null bytes in paths
- Generate unique filenames (timestamp + random + sanitized name)

### 6. Configuration

Support configuration via:
- Environment variables
- Programmatic options
- Lazy dotenv initialization

Required env vars per driver:
- **S3**: `BUCKET_NAME`, `AWS_REGION`, optional `AWS_ACCESS_KEY`, `AWS_SECRET_KEY`
- **GCS**: `BUCKET_NAME`, `GCS_PROJECT_ID`, optional `GCS_CREDENTIALS`
- **Azure**: `AZURE_CONNECTION_STRING` OR `AZURE_ACCOUNT_NAME` + `AZURE_ACCOUNT_KEY`, container name
- **Local**: `LOCAL_PATH`

Common: `BUCKET_PATH`, `PRESIGNED_URL_EXPIRY`, `MAX_FILE_SIZE`

### 7. Presigned URL Constraints

- S3/GCS: Enforce content-type and file size at URL level
- Azure: Cannot enforce at URL level, must validate post-upload
- Maximum expiry: 7 days (604800 seconds)

### 8. Authentication Methods

- **S3**: Explicit credentials OR IAM roles (default credential chain)
- **GCS**: Service account JSON OR Application Default Credentials
- **Azure**: Connection string, Account+Key, OR Managed Identity (DefaultAzureCredential)

### 9. Error Handling

- Return structured results with `success`, `error`, `fileName`, etc.
- `DeleteResult` should include error details
- Individual file results in batch operations
- Clear error messages

### 10. Cross-Platform

- Handle Windows path separators
- Normalize URLs (no backslashes)
- Consistent path handling

---

## Architecture

```
src/
├── index.ts                 # Public exports
├── storage-manager.ts       # Main facade class
├── types/
│   └── storage.types.ts     # Type definitions
├── drivers/
│   ├── base.driver.ts       # Abstract base class
│   ├── local.driver.ts      # Local filesystem
│   ├── s3.driver.ts         # AWS S3 + S3Presigned
│   ├── gcs.driver.ts        # GCS + GCSPresigned
│   └── azure.driver.ts      # Azure + AzurePresigned
├── factory/
│   └── driver.factory.ts    # Driver instantiation
└── utils/
    ├── config.utils.ts      # Configuration loading/validation
    └── file.utils.ts        # File utilities
```

---

## Quality Checklist

### Code Quality
- [ ] No TypeScript errors
- [ ] No unused variables/imports
- [ ] Consistent error handling
- [ ] Proper async/await usage
- [ ] No unhandled promise rejections

### Security
- [ ] Path traversal prevention
- [ ] Input sanitization
- [ ] No credential exposure
- [ ] Filename validation

### Consistency
- [ ] All drivers implement same interface
- [ ] Consistent return types
- [ ] Consistent error messages
- [ ] Consistent parameter handling

### Edge Cases
- [ ] Empty strings handled
- [ ] Null/undefined handled
- [ ] Large files handled
- [ ] Special characters handled
- [ ] Files without extensions handled
- [ ] Pagination edge cases handled

### Documentation
- [ ] Public methods documented
- [ ] Examples in README
- [ ] Types exported correctly

---

## Review Focus Areas

1. **Type Safety** - Strict TypeScript, no `any` types
2. **Error Paths** - All error conditions handled
3. **Edge Cases** - Boundary conditions tested
4. **Consistency** - Same behavior across drivers
5. **Security** - Input validation everywhere
6. **Performance** - Parallel operations where possible
7. **Memory** - No memory leaks, proper cleanup
8. **API Design** - Intuitive, consistent interfaces

---

*This document serves as the source of truth for bug hunting.*
