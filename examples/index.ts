/**
 * Express Storage - Unified Example
 * 
 * This example works with ALL storage drivers based on your .env configuration.
 * Simply change FILE_DRIVER in your .env to switch between:
 * - local: Local disk storage
 * - s3 / s3-presigned: AWS S3
 * - gcs / gcs-presigned: Google Cloud Storage  
 * - azure / azure-presigned: Azure Blob Storage
 * 
 * Setup:
 * 1. Copy env.example to .env
 * 2. Configure your storage driver and credentials
 * 3. Run: npx tsx examples/index.ts
 */

import 'dotenv/config';
import express, { Request, Response } from 'express';
import multer from 'multer';
import { StorageManager } from '../src/index.js';

const app = express();
app.use(express.json());

// Configure multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Initialize storage manager - reads from environment variables
const storage = new StorageManager();

const config = storage.getConfig();
const isPresigned = storage.isPresignedSupported();

console.log('\n📦 Express Storage Example');
console.log('═'.repeat(50));
console.log(`🔧 Driver: ${storage.getDriverType()}`);
console.log(`🔐 Presigned Mode: ${isPresigned ? 'Yes' : 'No'}`);

if (config.driver === 'local') {
  console.log(`📂 Local Path: ${config.localPath}`);
} else if (config.driver.includes('s3')) {
  console.log(`🪣 Bucket: ${config.bucketName}`);
  console.log(`📁 Path: ${config.bucketPath || '(root)'}`);
  console.log(`🌍 Region: ${config.awsRegion}`);
} else if (config.driver.includes('gcs')) {
  console.log(`🪣 Bucket: ${config.bucketName}`);
  console.log(`📁 Path: ${config.bucketPath || '(root)'}`);
  console.log(`📋 Project: ${config.gcsProjectId}`);
} else if (config.driver.includes('azure')) {
  console.log(`📦 Container: ${config.azureContainerName || config.bucketName}`);
  console.log(`📁 Path: ${config.bucketPath || '(root)'}`);
}

if (isPresigned) {
  console.log(`⏱️  URL Expiry: ${config.presignedUrlExpiry}s`);
}
console.log('═'.repeat(50));

// =============================================================================
// DIRECT UPLOAD ENDPOINTS (for local, s3, gcs, azure)
// =============================================================================

/**
 * Upload single file
 * POST /upload
 * Body: multipart/form-data with 'file' field
 */
app.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded' });
      return;
    }

    console.log(`📤 Uploading: ${req.file.originalname} (${req.file.size} bytes)`);

    const result = await storage.uploadFile(req.file, {
      maxSize: 10 * 1024 * 1024, // 10MB limit
    });

    if (result.success) {
      console.log(`✅ Uploaded: ${result.fileName}`);
      res.json({
        success: true,
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
 * Upload multiple files
 * POST /upload-multiple
 * Body: multipart/form-data with 'files' field (array)
 */
app.post('/upload-multiple', upload.array('files', 10), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      res.status(400).json({ success: false, error: 'No files uploaded' });
      return;
    }

    console.log(`📤 Uploading ${files.length} files...`);

    const results = await storage.uploadFiles(files, {
      maxSize: 5 * 1024 * 1024, // 5MB per file
    });

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    console.log(`✅ Uploaded: ${successful.length}, ❌ Failed: ${failed.length}`);

    res.json({
      success: true,
      total: results.length,
      uploaded: successful.length,
      failed: failed.length,
      results,
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    });
  }
});

// =============================================================================
// PRESIGNED URL ENDPOINTS (for s3-presigned, gcs-presigned, azure-presigned)
// =============================================================================

/**
 * Initialize presigned upload
 * POST /presigned/init
 * Body: { fileName, contentType, fileSize, folder? }
 * 
 * Flow:
 * 1. Frontend analyzes file and sends metadata
 * 2. Backend generates presigned URL with constraints
 * 3. Frontend uploads directly to cloud using PUT
 * 4. Frontend confirms upload via /presigned/confirm
 */
app.post('/presigned/init', async (req: Request, res: Response) => {
  try {
    const { fileName, contentType, fileSize, folder } = req.body;

    if (!fileName) {
      res.status(400).json({ success: false, error: 'fileName is required' });
      return;
    }

    console.log(`🔗 Generating presigned URL for: ${fileName}`);
    console.log(`   Content-Type: ${contentType || 'not specified'}`);
    console.log(`   File Size: ${fileSize ? `${fileSize} bytes` : 'not specified'}`);
    console.log(`   Folder: ${folder || '(root)'}`);

    // Generate presigned URL with constraints and optional folder
    const result = await storage.generateUploadUrl(fileName, contentType, fileSize, folder);

    if (result.success) {
      console.log(`✅ URL generated:`);
      console.log(`   fileName: ${result.fileName}`);
      console.log(`   filePath: ${result.filePath || '(root)'}`);
      console.log(`   reference: ${result.reference}`);
      
      // In production, you would store this in your database:
      // await db.files.create({ 
      //   fileName: result.fileName,       // "1769107318637_photo.jpg"
      //   filePath: result.filePath,       // "users/123" or null
      //   reference: result.reference,     // "users/123/1769107318637_photo.jpg" - USE THIS FOR VIEW/DELETE
      //   contentType, 
      //   fileSize, 
      //   status: 'pending' 
      // });

      res.json({
        success: true,
        fileName: result.fileName,       // Just the filename with timestamp
        filePath: result.filePath,       // Folder path (or undefined if root)
        reference: result.reference,     // Full path - use this for view/delete operations
        uploadUrl: result.uploadUrl,
        contentType: result.contentType,
        fileSize: result.fileSize,
        expiresIn: result.expiresIn,
        requiresValidation: result.requiresValidation, // True for Azure - pass expected values to confirm endpoint
        instructions: {
          method: 'PUT',
          headers: {
            'Content-Type': contentType || 'application/octet-stream',
            ...(fileSize && { 'Content-Length': fileSize.toString() }),
          },
        },
      });
    } else {
      console.log(`❌ Failed: ${result.error}`);
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate URL',
    });
  }
});

/**
 * Confirm presigned upload completion
 * POST /presigned/confirm
 * Body: { reference, expectedContentType?, expectedFileSize? }
 * 
 * For Azure: pass expectedContentType and expectedFileSize to validate blob properties
 * For S3/GCS: these are optional (validation happens at URL level)
 */
app.post('/presigned/confirm', async (req: Request, res: Response) => {
  try {
    const { reference, expectedContentType, expectedFileSize } = req.body;

    if (!reference) {
      res.status(400).json({ success: false, error: 'reference is required' });
      return;
    }

    console.log(`🔍 Verifying upload: ${reference}`);
    
    // For Azure, validate blob properties; for S3/GCS, just verify existence
    const validationResult = await storage.validateAndConfirmUpload(reference, {
      expectedContentType,
      expectedFileSize,
    });

    if (validationResult.success) {
      console.log(`✅ Upload confirmed: ${reference}`);
      if (validationResult.actualContentType) {
        console.log(`   Content-Type: ${validationResult.actualContentType}`);
      }
      if (validationResult.actualFileSize) {
        console.log(`   File Size: ${validationResult.actualFileSize} bytes`);
      }
      
      // In production, update database:
      // await db.files.update({ reference }, { status: 'uploaded' });

      res.json({
        success: true,
        message: 'Upload confirmed',
        reference,
        viewUrl: validationResult.viewUrl,
        actualContentType: validationResult.actualContentType,
        actualFileSize: validationResult.actualFileSize,
        expiresIn: validationResult.expiresIn,
      });
    } else {
      console.log(`❌ Validation failed: ${validationResult.error}`);
      res.status(400).json({ 
        success: false, 
        error: validationResult.error || 'File not found or validation failed',
        actualContentType: validationResult.actualContentType,
        actualFileSize: validationResult.actualFileSize,
      });
    }
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Confirmation failed',
    });
  }
});

/**
 * Generate view URL for existing file
 * POST /presigned/view
 * Body: { reference } - the full path reference
 */
app.post('/presigned/view', async (req: Request, res: Response) => {
  try {
    const { reference } = req.body;

    if (!reference) {
      res.status(400).json({ success: false, error: 'reference is required' });
      return;
    }

    const result = await storage.generateViewUrl(reference);

    if (result.success) {
      res.json({
        success: true,
        reference: result.reference,
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

// =============================================================================
// COMMON ENDPOINTS
// =============================================================================

/**
 * Delete file
 * DELETE /files/* (supports paths with folders like users/123/file.txt)
 * Or POST /files/delete with { reference } in body
 */
app.delete('/files/*', async (req: Request, res: Response) => {
  try {
    // Get the full path (reference) after /files/
    const reference = req.params[0];
    
    console.log(`🗑️  Deleting: ${reference}`);
    
    const result = await storage.deleteFile(reference);

    if (result) {
      console.log(`✅ Deleted: ${reference}`);
    } else {
      console.log(`❌ Delete failed: ${reference}`);
    }

    res.json({
      success: result,
      message: result ? 'File deleted' : 'File not found or deletion failed',
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Deletion failed',
    });
  }
});

/**
 * Delete file (POST method - better for paths with special characters)
 * POST /files/delete
 * Body: { reference } - the full path reference from generateUploadUrl
 */
app.post('/files/delete', async (req: Request, res: Response) => {
  try {
    const { reference } = req.body;
    
    if (!reference) {
      res.status(400).json({ success: false, error: 'reference is required' });
      return;
    }
    
    console.log(`🗑️  Deleting: ${reference}`);
    
    const result = await storage.deleteFile(reference);

    if (result) {
      console.log(`✅ Deleted: ${reference}`);
    } else {
      console.log(`❌ Delete failed: ${reference}`);
    }

    res.json({
      success: result,
      message: result ? 'File deleted' : 'File not found or deletion failed',
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Deletion failed',
    });
  }
});

/**
 * Get storage info
 * GET /storage/info
 */
app.get('/storage/info', (_req: Request, res: Response) => {
  const cfg = storage.getConfig();
  
  res.json({
    driver: storage.getDriverType(),
    isPresignedSupported: storage.isPresignedSupported(),
    bucketName: cfg.bucketName,
    bucketPath: cfg.bucketPath || '(root)',
    presignedUrlExpiry: cfg.presignedUrlExpiry,
    availableDrivers: StorageManager.getAvailableDrivers(),
  });
});

/**
 * Health check
 * GET /health
 */
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', driver: storage.getDriverType() });
});

// =============================================================================
// START SERVER
// =============================================================================

const PORT = process.env['PORT'] || 3000;

app.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log('\n📋 Available Endpoints:');
  console.log('─'.repeat(50));
  
  console.log('\n   Direct Upload (all drivers):');
  console.log('   POST   /upload              - Upload single file');
  console.log('   POST   /upload-multiple     - Upload multiple files');
  
  if (isPresigned) {
    console.log('\n   Presigned URLs (cloud drivers with -presigned):');
    console.log('   POST   /presigned/init     - Get presigned upload URL');
    console.log('   POST   /presigned/confirm  - Confirm upload & get view URL');
    console.log('   POST   /presigned/view     - Get presigned view URL');
  }
  
  console.log('\n   Common:');
  console.log('   DELETE /files/*             - Delete a file (use reference)');
  console.log('   POST   /files/delete        - Delete a file (reference in body)');
  console.log('   GET    /storage/info        - Get storage information');
  console.log('   GET    /health              - Health check');
  
  console.log('\n💡 Example Commands:');
  console.log('─'.repeat(50));
  console.log(`\n   # Upload a file`);
  console.log(`   curl -X POST -F "file=@./image.jpg" http://localhost:${PORT}/upload`);
  
  if (isPresigned) {
    console.log(`\n   # Get presigned upload URL (with optional folder)`);
    console.log(`   curl -X POST -H "Content-Type: application/json" \\`);
    console.log(`        -d '{"fileName":"photo.jpg","contentType":"image/jpeg","fileSize":12345,"folder":"users/123"}' \\`);
    console.log(`        http://localhost:${PORT}/presigned/init`);
    console.log(`   # Response includes: fileName, filePath, reference (use reference for view/delete)`);
    
    console.log(`\n   # Upload to presigned URL (use uploadUrl from above response)`);
    console.log(`   curl -X PUT -H "Content-Type: image/jpeg" \\`);
    console.log(`        -H "Content-Length: 12345" \\`);
    console.log(`        --data-binary @./photo.jpg \\`);
    console.log(`        "PRESIGNED_UPLOAD_URL"`);
    
    console.log(`\n   # Confirm upload (use reference from init response)`);
    console.log(`   curl -X POST -H "Content-Type: application/json" \\`);
    console.log(`        -d '{"reference":"users/123/1234567890_photo.jpg"}' \\`);
    console.log(`        http://localhost:${PORT}/presigned/confirm`);
    
    console.log(`\n   # Delete file (use reference)`);
    console.log(`   curl -X POST -H "Content-Type: application/json" \\`);
    console.log(`        -d '{"reference":"users/123/1234567890_photo.jpg"}' \\`);
    console.log(`        http://localhost:${PORT}/files/delete`);
  }
  
  console.log('\n');
});
