import { startIngest, writeChunk, stopIngest } from '@/lib/liveIngest';

// Proxies browser-camera Go Live requests to the always-on relay service
// (see relay-service/) when configured — the ffmpeg process this needs
// can't survive across Vercel serverless function invocations, but a
// single long-running Node process elsewhere can. Falls back to the local
// in-process relay (lib/liveIngest.js) when INGEST_RELAY_URL isn't set, so
// local dev keeps working with zero extra setup.
const RELAY_URL = process.env.INGEST_RELAY_URL;
const RELAY_SECRET = process.env.INGEST_RELAY_SECRET;

function relayHeaders(extra = {}) {
  return { Authorization: `Bearer ${RELAY_SECRET}`, ...extra };
}

export async function relayStart(sessionId, rtmpUrl, streamKey, container = 'webm') {
  if (!RELAY_URL) {
    startIngest(sessionId, rtmpUrl, streamKey, container);
    return;
  }
  const res = await fetch(`${RELAY_URL}/ingest/start`, {
    method: 'POST',
    headers: relayHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ sessionId, rtmpUrl, streamKey, container }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Could not start the broadcast relay.');
  }
}

// Returns { ok, code? } — code is set to 'NOT_STARTED' when the relay has
// no active session for this sessionId (matches the shape the client
// already expects from the pre-relay local implementation).
export async function relayChunk(sessionId, buffer) {
  if (!RELAY_URL) {
    return { ok: writeChunk(sessionId, buffer) };
  }
  const res = await fetch(`${RELAY_URL}/ingest/chunk?sessionId=${encodeURIComponent(sessionId)}`, {
    method: 'POST',
    headers: relayHeaders(),
    body: buffer,
  });
  if (res.status === 409) return { ok: false, code: 'NOT_STARTED' };
  return { ok: res.ok };
}

export async function relayStop(sessionId) {
  if (!RELAY_URL) {
    stopIngest(sessionId);
    return;
  }
  await fetch(`${RELAY_URL}/ingest/stop?sessionId=${encodeURIComponent(sessionId)}`, {
    method: 'POST',
    headers: relayHeaders(),
  }).catch((err) => console.error('Failed to stop relay session', sessionId, err.message));
}
