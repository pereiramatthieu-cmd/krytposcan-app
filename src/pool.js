// Runs `worker` over `items` with at most `concurrency` in flight at once —
// scanning ~300 tickers one-by-one would be slow, and firing all 300 requests
// at once just queues behind the browser's per-host connection limit anyway.
export async function runPool(items, worker, concurrency, onProgress) {
  let nextIndex = 0;
  let done = 0;
  const results = new Array(items.length);

  async function runNext() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await worker(items[i], i);
      done++;
      onProgress?.(done, items.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runNext));
  return results;
}
