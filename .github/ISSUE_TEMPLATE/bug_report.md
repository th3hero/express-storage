---
name: Bug Report
about: Report a bug to help us improve express-storage
title: '[BUG] '
labels: bug
assignees: ''
---

## Bug Description

A clear and concise description of what the bug is.

## Steps to Reproduce

1. Configure storage with '...'
2. Call method '...'
3. Pass parameters '...'
4. See error

## Expected Behavior

What you expected to happen.

## Actual Behavior

What actually happened.

## Code Sample

```typescript
// Minimal code to reproduce the issue
import { StorageManager } from 'express-storage';

const storage = new StorageManager({
  driver: 'local', // or s3, gcs, azure
});

// Your code here
```

## Error Message

```
Paste any error messages or stack traces here
```

## Environment

- **express-storage version**: 
- **Node.js version**: 
- **Operating System**: 
- **Storage Provider**: (local / s3 / gcs / azure)
- **Express version**: 

## Additional Context

Add any other context about the problem here (screenshots, logs, etc.).

## Possible Solution

If you have ideas on how to fix this, please share.
