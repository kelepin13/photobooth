// Minimal structured-ish logger + in-memory usage counters.
// Good enough to eyeball in `fly logs` / terminal output without adding a
// logging service dependency.

// server.js (socket events) and the bundled API routes load this file as two
// separate module instances. Keeping the counters on globalThis makes both
// count into the same object, so /api/health sees socket activity too
// (same trick as lib/rooms.js).
const counters =
  globalThis.__photoboothCounters ||
  (globalThis.__photoboothCounters = {
    roomsCreated: 0,
    roomsJoined: 0,
    photosCapturedTotal: 0,
    stripsComposed: 0,
    boomerangsCaptured: 0,
    startedAt: Date.now(),
  });

function log(event, data = {}) {
  const line = { t: new Date().toISOString(), event, ...data };
  console.log(JSON.stringify(line));
}

function increment(counter) {
  if (counter in counters) counters[counter] += 1;
}

function getStats(extra = {}) {
  return {
    uptimeSeconds: Math.round((Date.now() - counters.startedAt) / 1000),
    ...counters,
    ...extra,
  };
}

module.exports = { log, increment, getStats };
