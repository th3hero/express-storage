/**
 * Azure Blob Storage Presigned URL (SAS) Example
 * 
 * This example demonstrates generating SAS (Shared Access Signature) URLs
 * for Azure Blob Storage. Clients can upload directly to Azure using these URLs.
 * 
 * Environment Variables Required:
 * - BUCKET_NAME=your-container-name
 * - AZURE_CONNECTION_STRING=your-connection-string
 * OR
 * - AZURE_ACCOUNT_NAME=your-account-name
 * - AZURE_ACCOUNT_KEY=your-account-key
 * - PRESIGNED_URL_EXPIRY=600 (optional, in seconds)
 */

import express, { Request, Response } from 'express';
import multer from 'multer';
import { StorageManager } from '../../src/index.js';

const app = express();
app.use(express.json());

// Configure multer for memory storage (used for hybrid upload)
const upload = multer({ storage: multer.memoryStorage() });

// Initialize storage manager with centralized configuration
const storage = new StorageManager({
  driver: 'azure-presigned',
  credentials: {
    bucketName: process.env['BUCKET_NAME'],
    azureConnectionString: process.env['AZURE_CONNECTION_STRING'],
    azureAccountName: process.env['AZURE_ACCOUNT_NAME'],
    azureAccountKey: process.env['AZURE_ACCOUNT_KEY'],
    azureContainerName: process.env['AZURE_CONTAINER_NAME'],
    presignedUrlExpiry: Number(process.env['PRESIGNED_URL_EXPIRY']) || 600,
  }
});

console.log('☁️  Storage Driver:', storage.getDriverType());
console.log('📦 Container:', storage.getConfig().azureContainerName || storage.getConfig().bucketName);
console.log('⏱️  URL Expiry:', storage.getConfig().presignedUrlExpiry, 'seconds');

/**
 * Generate presigned upload URL (SAS URL) with optional content type
 */
app.post('/presigned/upload', async (req: Request, res: Response) => {
  try {
    const { fileName, contentType, maxSize } = req.body;

    if (!fileName) {
      res.status(400).json({ success: false, error: 'fileName is required' });
      return;
    }

    console.log(`🔗 Generating upload SAS URL for: ${fileName}`);

    // Generate presigned URL with optional constraints
    const result = await storage.generateUploadUrl(fileName, contentType, maxSize);

    if (result.success) {
      console.log(`✅ SAS URL generated for: ${fileName}`);
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
            'x-ms-blob-type': 'BlockBlob',
            'Content-Type': contentType || 'application/octet-stream',
          },
          body: 'File binary content',
        },
      });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('❌ Error:', error);
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

    console.log(`🔗 Generating ${fileNames.length} upload SAS URLs...`);

    const results = await storage.generateUploadUrls(fileNames);

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

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
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate upload URLs',
    });
  }
});

/**
 * Generate presigned view URL (SAS URL for reading)
 */
app.post('/presigned/view', async (req: Request, res: Response) => {
  try {
    const { fileName } = req.body;

    if (!fileName) {
      res.status(400).json({ success: false, error: 'fileName is required' });
      return;
    }

    console.log(`🔗 Generating view SAS URL for: ${fileName}`);

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
    console.error('❌ Error:', error);
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
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate view URLs',
    });
  }
});

/**
 * Hybrid upload: Validate file and return SAS URL
 */
app.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file provided' });
      return;
    }

    // In presigned mode, uploadFile validates and returns SAS URL
    const result = await storage.uploadFile(req.file, {
      maxSize: 10 * 1024 * 1024, // 10MB
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'Upload URL generated. Use this URL to upload the file directly to Azure.',
        fileName: result.fileName,
        uploadUrl: result.fileUrl, // In presigned mode, fileUrl contains the upload URL
        instructions: {
          method: 'PUT',
          headers: {
            'x-ms-blob-type': 'BlockBlob',
            'Content-Type': req.file.mimetype,
          },
          body: 'File binary content',
        },
      });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate upload URL',
    });
  }
});

/**
 * Confirm upload completion
 */
app.post('/upload/confirm', async (req: Request, res: Response) => {
  try {
    const { fileName } = req.body;

    if (!fileName) {
      res.status(400).json({ success: false, error: 'fileName is required' });
      return;
    }

    console.log(`✅ Upload confirmed: ${fileName}`);

    // Generate view URL to confirm file exists
    const viewResult = await storage.generateViewUrl(fileName);

    res.json({
      success: true,
      message: 'Upload confirmed',
      fileName,
      viewUrl: viewResult.success ? viewResult.viewUrl : undefined,
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to confirm upload',
    });
  }
});

/**
 * Delete file
 */
app.delete('/files/:fileName', async (req: Request, res: Response) => {
  try {
    const { fileName } = req.params;

    const result = await storage.deleteFile(fileName);

    res.json({
      success: result,
      message: result ? 'File deleted successfully' : 'File not found or delete failed',
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Delete failed',
    });
  }
});

/**
 * Storage info
 */
app.get('/storage/info', (_req: Request, res: Response) => {
  const config = storage.getConfig();
  res.json({
    driver: storage.getDriverType(),
    containerName: config.azureContainerName || config.bucketName,
    presignedUrlExpiry: config.presignedUrlExpiry,
    availableDrivers: StorageManager.getAvailableDrivers(),
  });
});

const PORT = process.env['PORT'] || 3006;
app.listen(PORT, () => {
  console.log(`\n🚀 Azure Presigned Server running on http://localhost:${PORT}`);
  console.log('\n📋 Available endpoints:');
  console.log('   POST   /presigned/upload          - Get SAS upload URL');
  console.log('   POST   /presigned/upload-multiple - Get multiple SAS upload URLs');
  console.log('   POST   /presigned/view            - Get SAS view URL');
  console.log('   POST   /presigned/view-multiple   - Get multiple SAS view URLs');
  console.log('   POST   /upload                    - Hybrid: validate file & get URL');
  console.log('   POST   /upload/confirm            - Confirm upload completion');
  console.log('   DELETE /files/:fileName           - Delete file from Azure');
  console.log('   GET    /storage/info              - Get storage information');
  console.log('\n💡 Example flow:');
  console.log('   1. POST /presigned/upload with { "fileName": "image.jpg", "contentType": "image/jpeg" }');
  console.log('   2. Client uploads to returned uploadUrl using PUT with x-ms-blob-type: BlockBlob header');
  console.log('   3. POST /upload/confirm with { "fileName": "image.jpg" }');
});
