import { NextResponse } from 'next/server';

// In-memory fixed-window limiter. This is per-instance, not global — on
// Vercel's serverless runtime, concurrent instances each keep their own
// counters, so it won't hold an attacker to exactly `max` requests across
// the whole fleet. It still meaningfully raises the cost of brute-forcing
// login/signup/reset-email endpoints from a single warm connection, which
// is what these routes were missing entirely. For a hard guarantee across
// instances, swap this for a shared store (e.g. Upstash Redis).
const buckets = new Map();

function clientKey(req) {
  const forwardedFor = req.headers.get('x-forwarded-for');
  return forwardedFor ? forwardedFor.split(',')[0].trim() : 'unknown';
}

// Sweeps expired buckets so the map doesn't grow unbounded on a long-lived
// warm instance.
function sweep(now) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Returns a NextResponse 429 if the caller has exceeded `max` requests to
 * `routeName` within `windowMs`, otherwise null (caller should proceed).
 */
export function rateLimit(req, routeName, { max, windowMs }) {
  const now = Date.now();
  const key = `${routeName}:${clientKey(req)}`;

  if (buckets.size > 5000) sweep(now);

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;
  if (bucket.count > max) {
    const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
    return NextResponse.json(
      { error: 'Too many requests — please try again later.' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
    );
  }

  return null;
}
