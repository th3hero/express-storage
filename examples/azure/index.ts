/**
 * Azure Blob Storage Direct Upload Example
 * 
 * This example demonstrates direct file uploads to Azure Blob Storage.
 * Files are uploaded directly from the server to Azure.
 * 
 * Environment Variables Required:
 * - BUCKET_NAME=your-container-name
 * - AZURE_CONNECTION_STRING=your-connection-string
 * OR
 * - AZURE_ACCOUNT_NAME=your-account-name
 * - AZURE_ACCOUNT_KEY=your-account-key
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
  driver: 'azure',
  credentials: {
    bucketName: process.env['BUCKET_NAME'],
    azureConnectionString: process.env['AZURE_CONNECTION_STRING'],
    azureAccountName: process.env['AZURE_ACCOUNT_NAME'],
    azureAccountKey: process.env['AZURE_ACCOUNT_KEY'],
    azureContainerName: process.env['AZURE_CONTAINER_NAME'],
  }
});

console.log('☁️  Storage Driver:', storage.getDriverType());
console.log('📦 Container:', storage.getConfig().azureContainerName || storage.getConfig().bucketName);

/**
 * Single file upload with validation
 */
app.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file provided' });
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
        message: 'File uploaded successfully',
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
 * Multiple files upload
 */
app.post('/upload-multiple', upload.array('files', 10), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      res.status(400).json({ success: false, error: 'No files provided' });
      return;
    }

    console.log(`📤 Uploading ${files.length} files to Azure...`);

    const results = await storage.uploadFiles(files, {
      maxSize: 5 * 1024 * 1024, // 5MB per file
    });

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`✅ Uploaded: ${successful.length}, ❌ Failed: ${failed.length}`);

    res.json({
      success: true,
      message: `Uploaded ${successful.length} of ${files.length} files`,
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

/**
 * Generate view URL (SAS URL for viewing)
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
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate view URL',
    });
  }
});

/**
 * Delete file
 */
app.delete('/files/:fileName', async (req: Request, res: Response) => {
  try {
    const { fileName } = req.params;

    console.log(`🗑️  Deleting: ${fileName}`);

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

const PORT = process.env['PORT'] || 3005;
app.listen(PORT, () => {
  console.log(`\n🚀 Azure Storage Server running on http://localhost:${PORT}`);
  console.log('\n📋 Available endpoints:');
  console.log('   POST   /upload          - Upload single file to Azure');
  console.log('   POST   /upload-multiple - Upload multiple files to Azure');
  console.log('   POST   /view-url        - Generate SAS view URL');
  console.log('   DELETE /files/:fileName - Delete file from Azure');
  console.log('   GET    /storage/info    - Get storage information');
  console.log('\n💡 Example curl command:');
  console.log('   curl -X POST -F "file=@./test.jpg" http://localhost:3005/upload');
});
