# Express Storage - Example

A unified example that works with **all storage drivers** based on your environment configuration.

## 🚀 Quick Start

### 1. Install Dependencies

From the project root:

```bash
npm install
npm run build
```

### 2. Configure Environment

```bash
# Copy example env file
cp examples/env.example examples/.env

# Edit with your configuration
nano examples/.env
```

### 3. Run the Example

```bash
# Using tsx (recommended)
npx tsx examples/index.ts

# Or using ts-node
npx ts-node --esm examples/index.ts
```

## 🔧 Configuration

Set `FILE_DRIVER` in your `.env` to switch between storage backends:

| Driver | Description |
|--------|-------------|
| `local` | Local disk storage |
| `s3` | AWS S3 direct upload |
| `s3-presigned` | AWS S3 with presigned URLs |
| `gcs` | Google Cloud Storage direct upload |
| `gcs-presigned` | GCS with presigned URLs |
| `azure` | Azure Blob Storage direct upload |
| `azure-presigned` | Azure with SAS URLs |

## 📋 API Endpoints

### Direct Upload (All Drivers)

```bash
# Upload single file
curl -X POST -F "file=@./image.jpg" http://localhost:3000/upload

# Upload multiple files
curl -X POST \
  -F "files=@./image1.jpg" \
  -F "files=@./image2.jpg" \
  http://localhost:3000/upload-multiple
```

### Presigned URLs (Cloud Drivers with `-presigned`)

```bash
# Step 1: Get presigned upload URL
curl -X POST -H "Content-Type: application/json" \
  -d '{"fileName":"photo.jpg","contentType":"image/jpeg","fileSize":12345}' \
  http://localhost:3000/presigned/init

# Step 2: Upload directly to cloud (use uploadUrl from response)
curl -X PUT -H "Content-Type: image/jpeg" \
  -H "Content-Length: 12345" \
  --data-binary @./photo.jpg \
  "PRESIGNED_UPLOAD_URL"

# Step 3: Confirm upload
curl -X POST -H "Content-Type: application/json" \
  -d '{"fileName":"1234567890_photo.jpg"}' \
  http://localhost:3000/presigned/confirm

# Get view URL for existing file
curl -X POST -H "Content-Type: application/json" \
  -d '{"fileName":"1234567890_photo.jpg"}' \
  http://localhost:3000/presigned/view
```

### Common Endpoints

```bash
# Delete file
curl -X DELETE http://localhost:3000/files/1234567890_image.jpg

# Get storage info
curl http://localhost:3000/storage/info

# Health check
curl http://localhost:3000/health
```

## 🔄 Presigned URL Flow

```
┌──────────┐                    ┌──────────┐                    ┌─────────────┐
│ Frontend │                    │ Backend  │                    │    Cloud    │
└────┬─────┘                    └────┬─────┘                    └──────┬──────┘
     │                               │                                 │
     │ 1. Analyze file               │                                 │
     │    (name, type, size)         │                                 │
     │                               │                                 │
     │ 2. POST /presigned/init       │                                 │
     │    {fileName, contentType,    │                                 │
     │     fileSize}                 │                                 │
     │──────────────────────────────>│                                 │
     │                               │                                 │
     │                               │ 3. generateUploadUrl()          │
     │                               │    (enforces name/type/size)    │
     │                               │                                 │
     │ 4. {uploadUrl, fileName}      │                                 │
     │<──────────────────────────────│                                 │
     │                               │                                 │
     │ 5. PUT uploadUrl              │                                 │
     │    (file binary)              │                                 │
     │─────────────────────────────────────────────────────────────────>│
     │                               │                                 │
     │ 6. POST /presigned/confirm    │                                 │
     │    {fileName}                 │                                 │
     │──────────────────────────────>│                                 │
     │                               │                                 │
     │                               │ 7. generateViewUrl()            │
     │                               │    (verify file exists)         │
     │                               │<────────────────────────────────>│
     │                               │                                 │
     │ 8. {viewUrl, success}         │                                 │
     │<──────────────────────────────│                                 │
     │                               │                                 │
```

## 🔐 File Size Enforcement

When using presigned URLs with `fileSize`, the upload is restricted:

| Provider | Enforcement |
|----------|-------------|
| **S3** | ✅ Exact size enforced via `Content-Length` |
| **GCS** | ✅ Exact size enforced via `x-goog-content-length-range` |
| **Azure** | ❌ Size not enforced (informational only) |

## 📁 Environment Variables

See `env.example` for all available configuration options.
