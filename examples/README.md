# Express Storage Examples

This folder contains working examples for each storage driver.

## 📁 Structure

```
examples/
├── local/           # Local disk storage
├── s3/              # AWS S3 direct upload
├── s3-presigned/    # AWS S3 presigned URLs
├── gcs/             # Google Cloud Storage direct upload
├── gcs-presigned/   # Google Cloud Storage presigned URLs
├── oci/             # Oracle Cloud Infrastructure (placeholder)
└── oci-presigned/   # OCI presigned URLs (placeholder)
```

## 🚀 Running Examples

### 1. Install Dependencies

From the root of the project:

```bash
npm install
npm run build
```

### 2. Configure Environment

Copy the `env.example` file in the example folder you want to run:

```bash
# For local storage
cp examples/local/env.example .env

# For S3
cp examples/s3/env.example .env
```

Edit the `.env` file with your credentials.

### 3. Run the Example

```bash
# Using ts-node (recommended for development)
npx ts-node --esm examples/local/index.ts

# Or using tsx
npx tsx examples/s3/index.ts
```

## 📋 Examples Overview

### Local Storage (`examples/local/`)

- **Port:** 3000
- **Use case:** Development, local file storage
- **Features:** 
  - Single/multiple file upload
  - Automatic month/year directory organization
  - File deletion

### S3 Direct Upload (`examples/s3/`)

- **Port:** 3001
- **Use case:** Server-side upload to S3
- **Features:**
  - Direct upload from server to S3
  - Generate view URLs
  - File deletion

### S3 Presigned URLs (`examples/s3-presigned/`)

- **Port:** 3002
- **Use case:** Client-side direct upload to S3
- **Features:**
  - Generate presigned upload URLs
  - Generate presigned view URLs
  - Upload confirmation endpoint
  - Batch URL generation

### GCS Direct Upload (`examples/gcs/`)

- **Port:** 3003
- **Use case:** Server-side upload to Google Cloud Storage
- **Features:**
  - Direct upload from server to GCS
  - Generate view URLs
  - File deletion

### GCS Presigned URLs (`examples/gcs-presigned/`)

- **Port:** 3004
- **Use case:** Client-side direct upload to GCS
- **Features:**
  - Generate presigned upload URLs
  - Generate presigned view URLs
  - Upload confirmation endpoint

### OCI Object Storage (`examples/oci/`)

- **Port:** 3005
- **Status:** ⚠️ Placeholder implementation
- **Use case:** Server-side upload to OCI

### OCI Presigned URLs (`examples/oci-presigned/`)

- **Port:** 3006
- **Status:** ⚠️ Placeholder implementation
- **Use case:** Client-side direct upload to OCI

## 🧪 Testing with cURL

### Upload a file (Local/S3/GCS)

```bash
curl -X POST -F "file=@./test.jpg" http://localhost:3000/upload
```

### Upload multiple files

```bash
curl -X POST \
  -F "files=@./image1.jpg" \
  -F "files=@./image2.jpg" \
  http://localhost:3000/upload-multiple
```

### Get presigned upload URL (S3/GCS presigned)

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"fileName": "my-image.jpg"}' \
  http://localhost:3002/presigned/upload
```

### Upload to presigned URL

```bash
curl -X PUT \
  -H "Content-Type: image/jpeg" \
  --data-binary @./test.jpg \
  "PRESIGNED_URL_HERE"
```

### Delete a file

```bash
curl -X DELETE http://localhost:3000/files/1234567890_test.jpg
```

### Get storage info

```bash
curl http://localhost:3000/storage/info
```

## 🔧 Environment Variables

| Variable | Description | Required For |
|----------|-------------|--------------|
| `FILE_DRIVER` | Storage driver type | All |
| `BUCKET_NAME` | Cloud bucket name | S3, GCS, OCI |
| `LOCAL_PATH` | Local storage path | Local |
| `AWS_REGION` | AWS region | S3 |
| `AWS_ACCESS_KEY` | AWS access key | S3 |
| `AWS_SECRET_KEY` | AWS secret key | S3 |
| `GCS_PROJECT_ID` | GCS project ID | GCS |
| `GCS_CREDENTIALS` | Path to GCS credentials | GCS |
| `OCI_REGION` | OCI region | OCI |
| `OCI_CREDENTIALS` | Path to OCI credentials | OCI |
| `PRESIGNED_URL_EXPIRY` | URL expiry in seconds | All (optional) |
