export async function mapWithConcurrency(items, limit, mapper) {
  const source = Array.isArray(items) ? items : [];
  if (!source.length) return [];
  const concurrency = Math.min(source.length, Math.max(1, Math.floor(Number(limit) || 1)));
  const results = new Array(source.length);
  let next = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (next < source.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(source[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}
