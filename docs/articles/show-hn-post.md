# Show HN Post Draft

## Title Options (pick one)

**Option 1 (Recommended):**
> Show HN: Express Storage – One API for S3, GCS, Azure, and Local Disk

**Option 2:**
> Show HN: Unified file uploads for Express.js – switch cloud providers without code changes

**Option 3:**
> Show HN: I built a storage abstraction layer for Express after rewriting upload code too many times

---

## Post Body

I got tired of rewriting file upload code every time a project switched cloud providers.

Most Express apps start with local storage, then move to S3, and some eventually need to support GCS or Azure for different clients. Each migration meant:

- Learning a new SDK
- Rewriting upload/download logic  
- Re-implementing security checks (path traversal, filename sanitization)
- Updating presigned URL handling (which works differently on each provider)

So I built express-storage: a unified storage layer that lets you write upload code once and deploy to any cloud.

**Key features:**

- Single API for AWS S3, Google Cloud Storage, Azure Blob Storage, and local disk
- Switch providers by changing one env var (`FILE_DRIVER=s3` → `FILE_DRIVER=azure`)
- Security built-in: path traversal prevention, filename sanitization, file validation
- Presigned URLs that handle provider quirks (Azure needs post-upload validation, S3/GCS don't)
- TypeScript native with full type safety
- Large file handling with automatic streaming for files >100MB

**Example:**

```typescript
const storage = new StorageManager(); // reads FILE_DRIVER from env

const result = await storage.uploadFile(req.file, {
  maxSize: 10 * 1024 * 1024,
  allowedMimeTypes: ['image/jpeg', 'image/png']
});
```

Same code works whether `FILE_DRIVER` is `local`, `s3`, `gcs`, or `azure`.

GitHub: https://github.com/th3hero/express-storage
npm: https://www.npmjs.com/package/express-storage

Would love feedback on:
- The API design — is it intuitive?
- Security approach — anything I'm missing?
- Use cases you'd want supported

---

## Tips for Posting

1. **Best time to post**: Tuesday-Thursday, 8-10 AM EST
2. **Engage quickly**: Be ready to answer comments within the first hour
3. **Be honest about limitations**: HN appreciates candor
4. **Don't be promotional**: Focus on the technical problem/solution
5. **Ask for specific feedback**: Shows you value the community's input

## Potential Questions to Prepare For

**Q: Why not just use the cloud SDKs directly?**
A: You can! This is for teams who want consistent code across providers, or apps that might migrate. The abstraction adds minimal overhead.

**Q: What's the performance overhead?**
A: Minimal — it's mostly a thin wrapper. For presigned URLs, there's essentially zero overhead since clients upload directly.

**Q: Why not use an existing solution like pkgcloud?**
A: pkgcloud is great but hasn't been actively maintained. express-storage is TypeScript-native, has modern presigned URL support, and focuses on security.

**Q: Does it support [specific S3 feature]?**
A: The abstraction covers common operations. For provider-specific features like S3 Object Lock, you'd use the SDK directly.

---

## Alternative: Reddit Post (r/node or r/javascript)

**Title:** I built a unified storage layer for Express.js after getting frustrated with cloud provider migrations

**Body:** (Same as HN but slightly more casual tone, can include a few more emojis if the subreddit culture supports it)
