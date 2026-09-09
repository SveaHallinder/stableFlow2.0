let nextWriteId = 0;

// Register the whole operation synchronously, including image preparation before fetch.
export async function trackPendingWrite(
  operation: Promise<unknown>,
  pending: Set<string>,
  onStart: () => void,
  onError: (error: unknown) => void,
): Promise<void> {
  const key = `background:${++nextWriteId}`;
  pending.add(key);
  onStart();
  try {
    await operation;
  } catch (error) {
    onError(error);
  } finally {
    pending.delete(key);
  }
}
