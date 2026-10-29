// Simple in-memory sliding-window rate limiter, keyed by an arbitrary string
// (typically client IP + route name). Fine for a single-instance deployment;
// swap for a Redis-backed limiter if you scale to multiple instances, since
// each instance would otherwise track its own independent counters.
const globalForLimiter = globalThis;
const buckets = globalForLimiter.__photoboothRateLimits || (globalForLimiter.__photoboothRateLimits = new Map());

/**
 * @param {string} key - e.g. `${ip}:filter`
 * @param {number} limit - max requests allowed within the window
 * @param {number} windowMs - window size in ms
 * @returns {{ allowed: boolean, retryAfterMs: number, remaining: number }}
 */
function checkRateLimit(key, limit, windowMs) {
  const now = Date.now();
  const windowStart = now - windowMs;
  const timestamps = (buckets.get(key) || []).filter((t) => t > windowStart);

  if (timestamps.length >= limit) {
    const retryAfterMs = timestamps[0] + windowMs - now;
    buckets.set(key, timestamps);
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0), remaining: 0 };
  }

  timestamps.push(now);
  buckets.set(key, timestamps);
  return { allowed: true, retryAfterMs: 0, remaining: limit - timestamps.length };
}

function getClientIp(req) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

module.exports = { checkRateLimit, getClientIp };
