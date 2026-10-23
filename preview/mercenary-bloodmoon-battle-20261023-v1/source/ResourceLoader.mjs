export async function settleAssetBatch(tasks, release) {
  const results = await Promise.allSettled(tasks.map(task => Promise.resolve().then(task)));
  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length) {
    await Promise.allSettled(results.map((r, i) => r.status === 'fulfilled' ? Promise.resolve().then(() => release(r.value, i)) : undefined));
    throw new AggregateError(failures.map(r => r.reason), failures[0].reason?.message || '전투 리소스 로드 실패');
  }
  return results.map(r => r.value);
}
