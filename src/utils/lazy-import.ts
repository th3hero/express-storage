function isModuleNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND';
}

export function createLazyImport<T>(
  load: () => Promise<T>,
  missingMessage: string
): () => Promise<T> {
  let cached: Promise<T> | undefined;
  return () => {
    if (!cached) {
      cached = load().catch((error: unknown) => {
        cached = undefined;
        if (isModuleNotFound(error)) {
          throw new Error(missingMessage);
        }
        throw error;
      });
    }
    return cached;
  };
}
