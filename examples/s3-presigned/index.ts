/**
 * AWS S3 Presigned URL Example
 * 
 * This example demonstrates presigned URL generation for S3.
 * Frontend can use these URLs to upload files directly to S3.
 * 
 * Flow:
 * 1. Client requests presigned upload URL from this server
 * 2. Server generates presigned URL and returns it
 * 3. Client uploads file directly to S3 using the presigned URL
 * 4. Client confirms upload completion to server
 * 
 * Environment Variables Required:
 * - BUCKET_NAME=your-bucket-name
 * - AWS_REGION=us-east-1
 * - AWS_ACCESS_KEY=your-access-key (optional on AWS with IAM roles)
 * - AWS_SECRET_KEY=your-secret-key (optional on AWS with IAM roles)
 * - PRESIGNED_URL_EXPIRY=600 (optional, in seconds)
 */

import express, { Request, Response } from 'express';
import multer from 'multer';
import { StorageManager } from '../../src/index.js';

const app = express();
app.use(express.json());

// Configure multer for memory storage (used for hybrid approach)
const upload = multer({ storage: multer.memoryStorage() });

// Initialize storage manager with centralized configuration
const storage = new StorageManager({
  driver: 's3-presigned',
  credentials: {
    bucketName: process.env['BUCKET_NAME'],
    awsRegion: process.env['AWS_REGION'],
    awsAccessKey: process.env['AWS_ACCESS_KEY'],
    awsSecretKey: process.env['AWS_SECRET_KEY'],
    presignedUrlExpiry: Number(process.env['PRESIGNED_URL_EXPIRY']) || 600,
  }
});

console.log('☁️  Storage Driver:', storage.getDriverType());
console.log('🪣 Bucket:', storage.getConfig().bucketName);
console.log('🌍 Region:', storage.getConfig().awsRegion);
console.log('⏱️  URL Expiry:', storage.getConfig().presignedUrlExpiry, 'seconds');

/**
 * Generate presigned upload URL with content type constraint
 * 
 * Client calls this to get a URL for direct upload to S3
 */
app.post('/presigned/upload', async (req: Request, res: Response) => {
  try {
    const { fileName, contentType, maxSize } = req.body;

    if (!fileName) {
      res.status(400).json({ success: false, error: 'fileName is required' });
      return;
    }

    console.log(`🔗 Generating upload URL for: ${fileName}`);

    // Generate presigned URL with optional content type and size constraints
    const result = await storage.generateUploadUrl(
      fileName, 
      contentType, // e.g., 'image/jpeg'
      maxSize // e.g., 5 * 1024 * 1024 for 5MB
    );

    if (result.success) {
      console.log(`✅ URL generated for: ${fileName}`);
      res.json({
        success: true,
        fileName: result.fileName,
        uploadUrl: result.uploadUrl,
        contentType: result.contentType,
        maxSize: result.maxSize,
        expiresIn: result.expiresIn,
        instructions: {
          method: 'PUT',
          headers: {
            'Content-Type': contentType || 'application/octet-stream',
          },
          note: 'Upload file using PUT request to the uploadUrl',
        },
      });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate upload URL',
    });
  }
});

/**
 * Generate multiple presigned upload URLs
 */
app.post('/presigned/upload-multiple', async (req: Request, res: Response) => {
  try {
    const { fileNames } = req.body;

    if (!fileNames || !Array.isArray(fileNames) || fileNames.length === 0) {
      res.status(400).json({ success: false, error: 'fileNames array is required' });
      return;
    }

    console.log(`🔗 Generating ${fileNames.length} upload URLs...`);

    const results = await storage.generateUploadUrls(fileNames);

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    console.log(`✅ Generated: ${successful.length}, ❌ Failed: ${failed.length}`);

    res.json({
      success: true,
      total: results.length,
      generated: successful.length,
      failed: failed.length,
      expiresIn: storage.getConfig().presignedUrlExpiry,
      results: results.map((r, i) => ({
        fileName: fileNames[i],
        ...r,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate URLs',
    });
  }
});

/**
 * Generate presigned view URL
 * 
 * Client calls this to get a temporary URL to view/download a file
 */
app.post('/presigned/view', async (req: Request, res: Response) => {
  try {
    const { fileName } = req.body;

    if (!fileName) {
      res.status(400).json({ success: false, error: 'fileName is required' });
      return;
    }

    console.log(`🔗 Generating view URL for: ${fileName}`);

    const result = await storage.generateViewUrl(fileName);

    if (result.success) {
      res.json({
        success: true,
        fileName: result.fileName,
        viewUrl: result.viewUrl,
        expiresIn: result.expiresIn,
      });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate view URL',
    });
  }
});

/**
 * Generate multiple presigned view URLs
 */
app.post('/presigned/view-multiple', async (req: Request, res: Response) => {
  try {
    const { fileNames } = req.body;

    if (!fileNames || !Array.isArray(fileNames) || fileNames.length === 0) {
      res.status(400).json({ success: false, error: 'fileNames array is required' });
      return;
    }

    const results = await storage.generateViewUrls(fileNames);

    res.json({
      success: true,
      total: results.length,
      expiresIn: storage.getConfig().presignedUrlExpiry,
      results: results.map((r, i) => ({
        fileName: fileNames[i],
        ...r,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate URLs',
    });
  }
});

/**
 * Hybrid approach: Server generates presigned URL from file metadata
 * 
 * This is useful when you want to validate the file before allowing upload
 */
app.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded' });
      return;
    }

    // In presigned mode, uploadFile returns the presigned URL
    const result = await storage.uploadFile(req.file, {
      maxSize: 10 * 1024 * 1024, // 10MB
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'Presigned URL generated for upload',
        fileName: result.fileName,
        uploadUrl: result.fileUrl, // In presigned mode, fileUrl contains the upload URL
        instructions: 'Use PUT request to upload file to the uploadUrl',
      });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process',
    });
  }
});

/**
 * Confirm upload completion (optional endpoint for tracking)
 */
app.post('/upload/confirm', async (req: Request, res: Response) => {
  try {
    const { fileName } = req.body;

    if (!fileName) {
      res.status(400).json({ success: false, error: 'fileName is required' });
      return;
    }

    // Here you could:
    // - Update database with file info
    // - Verify file exists in S3
    // - Trigger post-upload processing

    console.log(`✅ Upload confirmed: ${fileName}`);

    res.json({
      success: true,
      message: 'Upload confirmed',
      fileName,
      fileUrl: `https://${storage.getConfig().bucketName}.s3.${storage.getConfig().awsRegion}.amazonaws.com/${fileName}`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Confirmation failed',
    });
  }
});

/**
 * Delete file from S3
 */
app.delete('/files/:fileName', async (req: Request, res: Response) => {
  try {
    const { fileName } = req.params;
    const result = await storage.deleteFile(fileName);

    res.json({
      success: result,
      message: result ? 'File deleted from S3' : 'File not found or deletion failed',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Deletion failed',
    });
  }
});

/**
 * Get storage info
 */
app.get('/storage/info', (_req: Request, res: Response) => {
  const config = storage.getConfig();
  res.json({
    driver: storage.getDriverType(),
    bucket: config.bucketName,
    region: config.awsRegion,
    presignedUrlExpiry: config.presignedUrlExpiry,
    isPresignedSupported: storage.isPresignedSupported(),
  });
});

const PORT = process.env['PORT'] || 3002;
app.listen(PORT, () => {
  console.log(`\n🚀 S3 Presigned Server running on http://localhost:${PORT}`);
  console.log('\n📋 Available endpoints:');
  console.log('   POST   /presigned/upload          - Get presigned upload URL');
  console.log('   POST   /presigned/upload-multiple - Get multiple presigned upload URLs');
  console.log('   POST   /presigned/view            - Get presigned view URL');
  console.log('   POST   /presigned/view-multiple   - Get multiple presigned view URLs');
  console.log('   POST   /upload                    - Hybrid: validate file & get URL');
  console.log('   POST   /upload/confirm            - Confirm upload completion');
  console.log('   DELETE /files/:fileName           - Delete file from S3');
  console.log('   GET    /storage/info              - Get storage information');
  console.log('\n💡 Example flow:');
  console.log('   1. POST /presigned/upload with { "fileName": "image.jpg", "contentType": "image/jpeg" }');
  console.log('   2. Client uploads to returned uploadUrl using PUT');
  console.log('   3. POST /upload/confirm with { "fileName": "image.jpg" }');
});
