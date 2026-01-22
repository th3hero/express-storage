/**
 * Google Cloud Storage Direct Upload Example
 * 
 * This example demonstrates direct file upload to Google Cloud Storage.
 * Files are uploaded from server to GCS bucket directly.
 * 
 * Environment Variables Required:
 * - BUCKET_NAME=your-bucket-name
 * - GCS_PROJECT_ID=your-project-id
 * - GCS_CREDENTIALS=path/to/service-account.json (optional on GCP with ADC)
 */

import express, { Request, Response } from 'express';
import multer from 'multer';
import { StorageManager } from '../../src/index.js';

const app = express();
app.use(express.json());

// Configure multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Initialize storage manager with centralized configuration
const storage = new StorageManager({
  driver: 'gcs',
  credentials: {
    bucketName: process.env['BUCKET_NAME'],
    gcsProjectId: process.env['GCS_PROJECT_ID'],
    gcsCredentials: process.env['GCS_CREDENTIALS'],
  }
});

console.log('☁️  Storage Driver:', storage.getDriverType());
console.log('🪣 Bucket:', storage.getConfig().bucketName);
console.log('📁 Project ID:', storage.getConfig().gcsProjectId);

/**
 * Single file upload to GCS with validation
 */
app.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded' });
      return;
    }

    console.log(`📤 Uploading: ${req.file.originalname} (${req.file.size} bytes)`);

    const result = await storage.uploadFile(req.file, {
      maxSize: 10 * 1024 * 1024, // 10MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
    });

    if (result.success) {
      console.log(`✅ Uploaded: ${result.fileName}`);
      res.json({
        success: true,
        message: 'File uploaded to GCS successfully',
        fileName: result.fileName,
        fileUrl: result.fileUrl,
      });
    } else {
      console.log(`❌ Failed: ${result.error}`);
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    });
  }
});

/**
 * Multiple files upload to GCS
 */
app.post('/upload-multiple', upload.array('files', 10), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      res.status(400).json({ success: false, error: 'No files uploaded' });
      return;
    }

    console.log(`📤 Uploading ${files.length} files to GCS...`);

    const results = await storage.uploadFiles(files, {
      maxSize: 5 * 1024 * 1024, // 5MB per file
    });

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    console.log(`✅ Uploaded: ${successful.length}, ❌ Failed: ${failed.length}`);

    res.json({
      success: true,
      message: 'Files processed',
      total: results.length,
      uploaded: successful.length,
      failed: failed.length,
      results,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    });
  }
});

/**
 * Generate presigned view URL for existing file
 */
app.post('/view-url', async (req: Request, res: Response) => {
  try {
    const { fileName } = req.body;

    if (!fileName) {
      res.status(400).json({ success: false, error: 'fileName is required' });
      return;
    }

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
      error: error instanceof Error ? error.message : 'Failed to generate URL',
    });
  }
});

/**
 * Delete file from GCS
 */
app.delete('/files/:fileName', async (req: Request, res: Response) => {
  try {
    const { fileName } = req.params;
    console.log(`🗑️  Deleting: ${fileName}`);

    const result = await storage.deleteFile(fileName);

    res.json({
      success: result,
      message: result ? 'File deleted from GCS' : 'File not found or deletion failed',
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
    projectId: config.gcsProjectId,
    isPresignedSupported: storage.isPresignedSupported(),
  });
});

const PORT = process.env['PORT'] || 3003;
app.listen(PORT, () => {
  console.log(`\n🚀 GCS Storage Server running on http://localhost:${PORT}`);
  console.log('\n📋 Available endpoints:');
  console.log('   POST   /upload          - Upload single file to GCS');
  console.log('   POST   /upload-multiple - Upload multiple files to GCS');
  console.log('   POST   /view-url        - Generate presigned view URL');
  console.log('   DELETE /files/:fileName - Delete file from GCS');
  console.log('   GET    /storage/info    - Get storage information');
  console.log('\n💡 Example curl command:');
  console.log('   curl -X POST -F "file=@./test.jpg" http://localhost:3003/upload');
});
