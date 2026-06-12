const fileWriteQueues = new Map<string, Promise<void>>();

// Callers must pass a vault-normalized path (usually TFile.path). This module
// does not trim or normalize paths; it only serializes writes for the exact key.
// Non-reentrant by design: a callback must not call serializeFileWrite for the
// same path it already holds. Keep same-path locks at the outermost mutation
// span so read-compute-write sequences cannot interleave or deadlock.
export async function serializeFileWrite<T>(path: string, fn: () => Promise<T>): Promise<T> {
  if (!path) throw new Error("file write path is required");
  const key = path;

  const previous = fileWriteQueues.get(key) ?? Promise.resolve();
  const wait = previous.catch(() => undefined);
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = wait.then(() => current);
  fileWriteQueues.set(key, queued);

  await wait;
  try {
    return await fn();
  } finally {
    release();
    if (fileWriteQueues.get(key) === queued) {
      fileWriteQueues.delete(key);
    }
  }
}
