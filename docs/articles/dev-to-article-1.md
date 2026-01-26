---
title: Stop Writing Separate Upload Code for Every Cloud Provider
published: false
description: How I built a unified storage layer for Express.js that works with S3, GCS, Azure, and local disk — and why you should stop copy-pasting cloud SDK code.
tags: javascript, nodejs, typescript, webdev
cover_image: 
canonical_url: 
---

# Stop Writing Separate Upload Code for Every Cloud Provider

Every Express.js application needs file uploads. And every developer makes the same mistakes.

You start simple: local storage with multer. Files go to `/uploads`. Ship it.

Then production hits. "We need S3 for scalability." So you install `multer-s3`, rewrite your upload logic, and spend a day debugging IAM permissions.

Six months later: "We're migrating to Azure." Another rewrite. Another day of debugging.

Sound familiar?

## The Problem with Provider-Specific Code

Here's what typical Express file upload code looks like when you support multiple providers:

```javascript
// AWS S3
const s3Storage = multerS3({
  s3: new S3Client({ region: 'us-east-1' }),
  bucket: 'my-bucket',
  key: (req, file, cb) => cb(null, `uploads/${Date.now()}_${file.originalname}`)
});

// Google Cloud Storage
const gcsStorage = new MulterGCS({
  bucket: 'my-bucket',
  projectId: 'my-project',
  filename: (req, file, cb) => cb(null, `uploads/${Date.now()}_${file.originalname}`)
});

// Azure Blob Storage
const azureStorage = new MulterAzure({
  connectionString: process.env.AZURE_CONNECTION,
  container: 'my-container'
});

// Local
const localStorage = multer.diskStorage({
  destination: './uploads',
  filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`)
});

// Then you need logic to switch between them...
const upload = multer({ 
  storage: process.env.STORAGE === 's3' ? s3Storage : 
           process.env.STORAGE === 'gcs' ? gcsStorage :
           process.env.STORAGE === 'azure' ? azureStorage : 
           localStorage 
});
```

This approach has problems:

1. **Duplicated logic** — Filename generation, validation, error handling repeated 4 times
2. **Inconsistent APIs** — Each package has different options and return values
3. **Security gaps** — Did you add path traversal protection to all four?
4. **Testing nightmare** — Need to mock 4 different SDKs

## A Better Approach: Unified Storage

What if you could write upload code once and deploy anywhere?

```typescript
import { StorageManager } from 'express-storage';

const storage = new StorageManager(); // Uses FILE_DRIVER env var

app.post('/upload', upload.single('file'), async (req, res) => {
  const result = await storage.uploadFile(req.file, {
    maxSize: 10 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf']
  });

  if (result.success) {
    res.json({ url: result.fileUrl });
  } else {
    res.status(400).json({ error: result.error });
  }
});
```

Switch providers by changing one environment variable:

```env
# Development
FILE_DRIVER=local

# Production (AWS)
FILE_DRIVER=s3

# Or Google Cloud
FILE_DRIVER=gcs

# Or Azure
FILE_DRIVER=azure
```

**Same code. Any cloud. Zero changes.**

## Security You Don't Have to Think About

File uploads are one of the most exploited attack vectors. When you're juggling four different upload implementations, security often slips.

### Path Traversal Protection

Attackers love filenames like `../../../etc/passwd`. A unified storage layer can block this everywhere:

```typescript
// These are automatically rejected
"../secret.txt"     // Path traversal
"..\\config.json"   // Windows path traversal  
"file\0.txt"        // Null byte injection
```

### Automatic Filename Sanitization

User-provided filenames are dangerous. Transform them into safe identifiers:

```
User uploads: "My Photo (1).jpg"
Stored as:    "1706123456789_a1b2c3d4e5_my_photo_1_.jpg"
```

The format `{timestamp}_{random}_{sanitized}` prevents collisions and removes dangerous characters.

### Consistent Validation

Same rules, every provider:

```typescript
await storage.uploadFile(file, {
  maxSize: 5 * 1024 * 1024,           // 5MB limit
  allowedMimeTypes: ['image/jpeg'],    // MIME type check
  allowedExtensions: ['.jpg', '.jpeg'] // Extension check
});
```

## Presigned URLs: The Right Way

Large files shouldn't flow through your server. Presigned URLs let clients upload directly to cloud storage.

But here's the catch: **every provider handles them differently.**

- **S3 and GCS**: Enforce content-type and size at the URL level
- **Azure**: No URL-level enforcement — must validate after upload

A good abstraction handles this for you:

```typescript
// Generate upload URL (works the same for all providers)
const { uploadUrl, reference } = await storage.generateUploadUrl(
  'video.mp4',
  'video/mp4',
  100 * 1024 * 1024 // 100MB
);

// Client uploads directly to cloud storage
// Your server never touches the bytes

// Validate and confirm (handles Azure quirks automatically)
const result = await storage.validateAndConfirmUpload(reference, {
  expectedContentType: 'video/mp4'
});
```

## When to Use This Approach

**Good fit:**
- Apps that might change cloud providers
- Teams working across AWS, GCP, and Azure projects
- Applications where security is critical
- Startups that don't want to rewrite upload code as they scale

**Maybe not:**
- Single-cloud shops with no migration plans
- Apps needing very provider-specific features (S3 Object Lock, etc.)
- Performance-critical systems where abstraction overhead matters

## Getting Started

```bash
npm install express-storage
```

```typescript
import express from 'express';
import multer from 'multer';
import { StorageManager } from 'express-storage';

const app = express();
const upload = multer();
const storage = new StorageManager();

app.post('/upload', upload.single('file'), async (req, res) => {
  const result = await storage.uploadFile(req.file);
  res.json(result);
});
```

Configure with environment variables:

```env
FILE_DRIVER=s3
BUCKET_NAME=my-bucket
AWS_REGION=us-east-1
```

That's it. No rewriting when you switch clouds.

---

## What's Next?

I built [express-storage](https://github.com/th3hero/express-storage) after getting frustrated with maintaining separate upload code for different clients — some on AWS, some on Azure, some on GCP.

The goal was simple: **write upload code once, deploy anywhere, with security built in.**

Check it out on [GitHub](https://github.com/th3hero/express-storage) or [npm](https://www.npmjs.com/package/express-storage). Contributions welcome!

---

*Have you dealt with multi-cloud storage in your apps? What's your approach? Let me know in the comments.*
