import express from 'express';
import multer from 'multer';
import { 
  StorageManager, 
  uploadFile, 
  uploadFiles, 
  generateUploadUrl, 
  generateViewUrl 
} from '../src/index';

const app = express();

// Configure multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Example 1: Using StorageManager class
app.post('/upload-single', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Method 1: Using StorageManager class
    const storageManager = new StorageManager();
    const result = await storageManager.uploadFile(req.file);

    res.json({
      message: 'File uploaded successfully',
      result
    });
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Upload failed' 
    });
  }
});

// Example 2: Using convenience functions
app.post('/upload-multiple', upload.array('files', 5), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Method 2: Using convenience functions
    const results = await uploadFiles(files);

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    res.json({
      message: 'Files uploaded',
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

// Example 3: Presigned URLs (for cloud storage)
app.post('/generate-upload-url', async (req, res) => {
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
      error: error instanceof Error ? error.message : 'Failed to generate URL' 
    });
  }
});

app.post('/generate-view-url', async (req, res) => {
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
      error: error instanceof Error ? error.message : 'Failed to generate URL' 
    });
  }
});

// Example 4: Custom configuration
app.post('/upload-custom', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Initialize with custom configuration
    const storageManager = StorageManager.initialize({
      driver: 'local',
      localPath: 'uploads/custom'
    });

    const result = await storageManager.uploadFile(req.file);

    res.json({
      message: 'File uploaded with custom config',
      result
    });
  } catch (error) {
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Upload failed' 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Available endpoints:');
  console.log('POST /upload-single - Upload single file');
  console.log('POST /upload-multiple - Upload multiple files');
  console.log('POST /generate-upload-url - Generate presigned upload URL');
  console.log('POST /generate-view-url - Generate presigned view URL');
  console.log('POST /upload-custom - Upload with custom config');
}); 