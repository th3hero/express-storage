import express from 'express';
import multer from 'multer';
import { 
  StorageManager, 
  uploadFile, 
  uploadFiles, 
  generateUploadUrl, 
  generateViewUrl,
  deleteFile,
  deleteFiles
} from '../src/index';

const app = express();
app.use(express.json());

// Configure multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// ============================================================================
// EXAMPLE 1: Basic Local Storage Usage
// ============================================================================

app.post('/upload/local', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Method 1: Using convenience function
    const result = await uploadFile(req.file);
    
    res.json({
      message: 'File uploaded to local storage',
      result
    });
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Upload failed' 
    });
  }
});

// ============================================================================
// EXAMPLE 2: Multiple File Upload
// ============================================================================

app.post('/upload/multiple', upload.array('files', 10), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Method 2: Using convenience function for multiple files
    const results = await uploadFiles(files);

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    res.json({
      message: 'Multiple files uploaded',
      total: results.length,
      successful: successful.length,
      failed: failed.length,
      results
    });
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Upload failed' 
    });
  }
});

// ============================================================================
// EXAMPLE 3: Using StorageManager Class
// ============================================================================

app.post('/upload/manager', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Method 3: Using StorageManager class
    const storageManager = new StorageManager();
    const result = await storageManager.uploadFile(req.file);

    res.json({
      message: 'File uploaded using StorageManager',
      result,
      config: storageManager.getConfig(),
      driverType: storageManager.getDriverType()
    });
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Upload failed' 
    });
  }
});

// ============================================================================
// EXAMPLE 4: Custom Configuration
// ============================================================================

app.post('/upload/custom', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Initialize with custom configuration
    const storageManager = StorageManager.initialize({
      driver: 'local',
      localPath: 'uploads/custom',
      presignedUrlExpiry: 900 // 15 minutes
    });

    const result = await storageManager.uploadFile(req.file);

    res.json({
      message: 'File uploaded with custom configuration',
      result
    });
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Upload failed' 
    });
  }
});

// ============================================================================
// EXAMPLE 5: File Deletion
// ============================================================================

app.delete('/files/:fileName', async (req, res) => {
  try {
    const { fileName } = req.params;
    
    const result = await deleteFile(fileName);
    
    res.json({
      message: result ? 'File deleted successfully' : 'File not found or deletion failed',
      deleted: result
    });
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Deletion failed' 
    });
  }
});

app.delete('/files', async (req, res) => {
  try {
    const { fileNames } = req.body;
    
    if (!Array.isArray(fileNames)) {
      return res.status(400).json({ error: 'fileNames must be an array' });
    }

    const results = await deleteFiles(fileNames);
    const successful = results.filter(r => r === true).length;
    const failed = results.filter(r => r === false).length;

    res.json({
      message: 'Multiple files deletion completed',
      total: fileNames.length,
      successful,
      failed,
      results
    });
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Deletion failed' 
    });
  }
});

// ============================================================================
// EXAMPLE 6: Presigned URLs (for cloud storage)
// ============================================================================

app.post('/presigned/upload', async (req, res) => {
  try {
    const { fileName } = req.body;
    
    if (!fileName) {
      return res.status(400).json({ error: 'fileName is required' });
    }

    const result = await generateUploadUrl(fileName);
    
    res.json({
      message: 'Upload URL generated',
      result
    });
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to generate upload URL' 
    });
  }
});

app.post('/presigned/view', async (req, res) => {
  try {
    const { fileName } = req.body;
    
    if (!fileName) {
      return res.status(400).json({ error: 'fileName is required' });
    }

    const result = await generateViewUrl(fileName);
    
    res.json({
      message: 'View URL generated',
      result
    });
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to generate view URL' 
    });
  }
});

// ============================================================================
// EXAMPLE 7: Storage Information
// ============================================================================

app.get('/storage/info', (req, res) => {
  try {
    const storageManager = new StorageManager();
    
    res.json({
      driverType: storageManager.getDriverType(),
      isPresignedSupported: storageManager.isPresignedSupported(),
      availableDrivers: StorageManager.getAvailableDrivers(),
      config: storageManager.getConfig()
    });
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to get storage info' 
    });
  }
});

// ============================================================================
// EXAMPLE 8: Error Handling
// ============================================================================

app.post('/upload/error-handling', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const result = await uploadFile(req.file);
    
    if (!result.success) {
      return res.status(400).json({
        error: 'Upload failed',
        details: result.error
      });
    }

    res.json({
      message: 'Upload successful',
      fileName: result.fileName,
      fileUrl: result.fileUrl
    });
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Upload failed' 
    });
  }
});

// ============================================================================
// EXAMPLE 9: File Input Type Detection
// ============================================================================

app.post('/upload/smart', upload.fields([
  { name: 'singleFile', maxCount: 1 },
  { name: 'multipleFiles', maxCount: 5 }
]), async (req, res) => {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const storageManager = new StorageManager();
    
    const results: any[] = [];

    // Handle single file
    if (files.singleFile && files.singleFile.length > 0) {
      const result = await storageManager.upload({
        type: 'single',
        file: files.singleFile[0]
      });
      results.push(result);
    }

    // Handle multiple files
    if (files.multipleFiles && files.multipleFiles.length > 0) {
      const result = await storageManager.upload({
        type: 'multiple',
        files: files.multipleFiles
      });
      results.push(...(Array.isArray(result) ? result : [result]));
    }

    res.json({
      message: 'Files uploaded with smart detection',
      total: results.length,
      results
    });
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Upload failed' 
    });
  }
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Express Storage Server running on port ${PORT}`);
  console.log('');
  console.log('📁 Available endpoints:');
  console.log('POST /upload/local - Upload single file to local storage');
  console.log('POST /upload/multiple - Upload multiple files');
  console.log('POST /upload/manager - Upload using StorageManager class');
  console.log('POST /upload/custom - Upload with custom configuration');
  console.log('DELETE /files/:fileName - Delete single file');
  console.log('DELETE /files - Delete multiple files');
  console.log('POST /presigned/upload - Generate presigned upload URL');
  console.log('POST /presigned/view - Generate presigned view URL');
  console.log('GET /storage/info - Get storage information');
  console.log('POST /upload/error-handling - Upload with error handling');
  console.log('POST /upload/smart - Smart file input detection');
  console.log('');
  console.log('💡 Set FILE_DRIVER environment variable to switch storage drivers:');
  console.log('   - local (default)');
  console.log('   - s3, s3-presigned');
  console.log('   - gcs, gcs-presigned');
  console.log('   - oci, oci-presigned');
}); 