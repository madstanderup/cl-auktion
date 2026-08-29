export const REQUEST_TIMEOUT_MS = 12_000;

/** Kapper en Supabase-forespørgsel så UI'et ikke hænger på en død forbindelse. */
export async function withTimeout<T>(promise: PromiseLike<T>, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} tog for lang tid. Prøv igen.`));
    }, REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
