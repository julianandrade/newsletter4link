/**
 * RQ-007: run an async function over a list, a few at a time.
 *
 * The email ingest was sequential in both phases and its work is almost entirely waiting:
 * a DNS lookup and a HEAD per redirect hop, an embedding call, a scoring call. Measured on
 * 6 August 2026, one newsletter cost 25 seconds of extraction plus 3 to 7 seconds per item,
 * one item at a time, so a single email with twenty items took over two minutes and the
 * 300-second function ceiling bounded a run to two emails.
 *
 * A pool of workers rather than chunks. The chunked form in `lib/ai/embeddings.ts` waits
 * for the slowest item in each chunk before starting the next, which on work this uneven
 * leaves most of the window idle: one 25-second redirect chain stalls nineteen fast ones.
 *
 * Rejects if any task rejects, which is `Promise.all` semantics and is deliberate: the
 * ingest already relies on a throw reaching the per-email catch that marks the row FAILED.
 * Tasks already in flight run to completion, so a partial batch may have written rows.
 * That is safe here because re-processing a row cannot duplicate an article: the curator
 * checks by URL and by embedding first.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const workers = Math.max(1, Math.min(Math.trunc(limit) || 1, items.length));

  // Shared cursor rather than pre-sliced ranges: a worker that draws a run of fast items
  // comes back for more instead of finishing early while another is still grinding.
  let next = 0;

  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (;;) {
        const index = next;
        next += 1;
        if (index >= items.length) return;
        results[index] = await fn(items[index], index);
      }
    })
  );

  return results;
}
