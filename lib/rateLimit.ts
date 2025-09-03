type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function checkFreeTier(ip: string, limit = 5) {
  const now = Date.now();
  const key = ip || 'unknown';
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + 60 * 60 * 1000 }); // 1 hour window
    return { allowed: true, remaining: limit - 1 };
  }
  if (b.count >= limit) return { allowed: false, remaining: 0 };
  b.count += 1;
  return { allowed: true, remaining: limit - b.count };
}

