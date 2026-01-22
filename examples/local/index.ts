/**
 * Local Storage Example
 * 
 * This example demonstrates file upload to local disk storage.
 * Files are organized in month/year directories automatically.
 * 
 * Environment Variables Required:
 * - FILE_DRIVER=local
 * - LOCAL_PATH=public/uploads (optional, defaults to public/express-storage)
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
  driver: 'local',
  credentials: {
    localPath: process.env['LOCAL_PATH'] || 'public/express-storage',
  }
});

console.log('📁 Storage Driver:', storage.getDriverType());
console.log('📂 Local Path:', storage.getConfig().localPath);

/**
 * Single file upload endpoint with validation
 */
app.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded' });
      return;
    }

    // Upload with validation
    const result = await storage.uploadFile(req.file, {
      maxSize: 10 * 1024 * 1024, // 10MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
      allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.pdf'],
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'File uploaded successfully',
        fileName: result.fileName,
        fileUrl: result.fileUrl,
      });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    });
  }
});

/**
 * Multiple files upload endpoint
 */
app.post('/upload-multiple', upload.array('files', 10), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      res.status(400).json({ success: false, error: 'No files uploaded' });
      return;
    }

    // Upload multiple files with validation
    const results = await storage.uploadFiles(files, {
      maxSize: 5 * 1024 * 1024, // 5MB per file
    });

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

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
 * Delete file endpoint
 */
app.delete('/files/:fileName', async (req: Request, res: Response) => {
  try {
    const { fileName } = req.params;
    const result = await storage.deleteFile(fileName);

    res.json({
      success: result,
      message: result ? 'File deleted successfully' : 'File not found or deletion failed',
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
  res.json({
    driver: storage.getDriverType(),
    config: storage.getConfig(),
    isPresignedSupported: storage.isPresignedSupported(),
    availableDrivers: StorageManager.getAvailableDrivers(),
  });
});

const PORT = process.env['PORT'] || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Local Storage Server running on http://localhost:${PORT}`);
  console.log('\n📋 Available endpoints:');
  console.log('   POST   /upload          - Upload single file');
  console.log('   POST   /upload-multiple - Upload multiple files');
  console.log('   DELETE /files/:fileName - Delete a file');
  console.log('   GET    /storage/info    - Get storage information');
  console.log('\n💡 Example curl command:');
  console.log('   curl -X POST -F "file=@./test.jpg" http://localhost:3000/upload');
});
