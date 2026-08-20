export function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const e = error as {
    code?: unknown;
    statusCode?: unknown;
    status?: unknown;
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };

  const code = e.code;
  if (
    code === 404 ||
    code === '404' ||
    code === 'NotFound' ||
    code === 'NoSuchKey' ||
    code === 'ENOENT' ||
    code === 'BlobNotFound'
  ) {
    return true;
  }

  if (e.statusCode === 404 || e.status === 404) return true;
  if (e.name === 'NotFound' || e.name === 'NoSuchKey') return true;
  if (e.$metadata?.httpStatusCode === 404) return true;

  return false;
}
