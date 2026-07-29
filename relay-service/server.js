// Always-on relay for GospelGoLive's in-browser camera Go Live feature.
//
// Browsers can't speak RTMP, so going live "from this browser" (webcam, no
// OBS) works by: getUserMedia -> MediaRecorder (webm chunks) -> this relay
// -> ffmpeg (re-encode to h264/aac) -> RTMP -> Mux. One ffmpeg child process
// per session (churchId), kept in memory for the life of this process.
//
// This exists as a separate always-on service (rather than living inside
// the main Next.js app's API routes) specifically because that in-memory
// process needs to survive across the /start -> many /chunk -> /stop
// requests. On Vercel's serverless functions each request can land on a
// different, isolated instance, so a process started in one request is
// invisible to the next — this service is a single long-running Node
// process instead, so the session map actually persists.
const http = require('http');
const { URL } = require('url');
const { spawn, execSync } = require('child_process');

// ffmpeg-static's generic prebuilt binary segfaults specifically on the
// RTMP output path on this host (confirmed via a real broadcast crashing
// mid-stream, and via isolated testing: the exact same encode succeeds
// writing to a local file but segfaults instantly against a real rtmp://
// target). The Dockerfile installs a real system ffmpeg via apt, which is
// dynamically linked against this image's actual libraries; prefer that,
// falling back to ffmpeg-static only for local dev on machines without
// one on PATH.
let ffmpegPath = 'ffmpeg';
try {
  execSync(process.platform === 'win32' ? 'where ffmpeg' : 'which ffmpeg', { stdio: 'ignore' });
} catch {
  ffmpegPath = require('ffmpeg-static');
}

const PORT = process.env.PORT || 8080;
const SECRET = process.env.INGEST_RELAY_SECRET;

if (!SECRET) {
  console.error('INGEST_RELAY_SECRET is not set — refusing to start (every /ingest/* request would be unauthenticated).');
  process.exit(1);
}

const IDLE_TIMEOUT_MS = 20000;
const SWEEP_INTERVAL_MS = 10000;

// sessionId (churchId) -> { proc, lastChunkAt }
const sessions = new Map();

function stopIngest(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;
  sessions.delete(sessionId);
  try {
    session.proc.stdin.end();
  } catch {
    // already closed
  }
  setTimeout(() => {
    try {
      session.proc.kill('SIGKILL');
    } catch {
      // already exited
    }
  }, 2000);
}

function sweepStaleSessions() {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastChunkAt > IDLE_TIMEOUT_MS) {
      console.warn(`[relay] killing stale session ${sessionId} (no chunks for 20s)`);
      stopIngest(sessionId);
    }
  }
}
const sweepInterval = setInterval(sweepStaleSessions, SWEEP_INTERVAL_MS);
sweepInterval.unref();

function startIngest(sessionId, rtmpUrl, streamKey, container) {
  stopIngest(sessionId); // idempotent — only one active browser session per church

  const target = `${rtmpUrl}/${streamKey}`;
  const proc = spawn(
    ffmpegPath,
    [
      '-loglevel', 'warning',
      // Safari's MediaRecorder can only ever produce fragmented mp4, never
      // webm — the input format has to match whatever container the
      // browser actually recorded, not be hardcoded to webm.
      '-f', container === 'mp4' ? 'mp4' : 'webm',
      '-i', 'pipe:0',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      // Explicit HD-friendly bitrate cap — the browser captures at up to
      // 1080p, so this needs to be high enough to actually carry that.
      '-b:v', '3500k',
      '-maxrate', '3500k',
      '-bufsize', '7000k',
      '-g', '60',
      '-c:a', 'aac',
      '-ar', '44100',
      '-b:a', '128k',
      // Fragmented-mp4 input (Safari) arrives as a sequence of independent
      // moof/mdat boxes rather than webm's single continuous live stream,
      // which can make ffmpeg's default interleave buffering reorder
      // packets enough to trip "Packets are not in the proper order with
      // respect to DTS" — disabling it (ffmpeg's own suggested workaround)
      // forces packets out in arrival order instead.
      '-max_interleave_delta', '0',
      '-f', 'flv',
      target,
    ],
    { stdio: ['pipe', 'ignore', 'pipe'] }
  );

  proc.stderr.on('data', (chunk) => {
    console.error(`[relay ${sessionId}]`, chunk.toString());
  });
  proc.stdin.on('error', () => {
    // ffmpeg died mid-write (EPIPE) — the exit handler below cleans up the session.
  });
  proc.on('exit', (code, signal) => {
    console.log(`[relay ${sessionId}] ffmpeg exited (code ${code}, signal ${signal})`);
    sessions.delete(sessionId);
  });

  sessions.set(sessionId, { proc, lastChunkAt: Date.now() });
  return proc;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function isAuthorized(req) {
  return req.headers['authorization'] === `Bearer ${SECRET}`;
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host}`);
  } catch {
    send(res, 400, { error: 'Bad request' });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    send(res, 200, { ok: true, activeSessions: sessions.size });
    return;
  }

  if (!url.pathname.startsWith('/ingest/')) {
    send(res, 404, { error: 'Not found' });
    return;
  }

  if (!isAuthorized(req)) {
    req.resume(); // drain the body so the connection can close cleanly
    send(res, 401, { error: 'Unauthorized' });
    return;
  }

  try {
    if (req.method === 'POST' && url.pathname === '/ingest/start') {
      const body = await readJsonBody(req);
      if (!body.sessionId || !body.rtmpUrl || !body.streamKey) {
        send(res, 400, { error: 'sessionId, rtmpUrl, and streamKey are required' });
        return;
      }
      startIngest(body.sessionId, body.rtmpUrl, body.streamKey, body.container);
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/ingest/chunk') {
      const sessionId = url.searchParams.get('sessionId');
      if (!sessionId) {
        send(res, 400, { error: 'sessionId query param is required' });
        return;
      }
      const session = sessions.get(sessionId);
      if (!session || session.proc.stdin.destroyed) {
        req.resume();
        send(res, 409, { error: 'No active broadcast session', code: 'NOT_STARTED' });
        return;
      }
      session.lastChunkAt = Date.now();
      // Piped straight to ffmpeg's stdin rather than buffered into memory
      // first — the client already awaits each chunk upload before sending
      // the next one, so there's no risk of chunks arriving out of order.
      req.on('end', () => send(res, 200, { ok: true }));
      req.on('error', () => {
        // let ffmpeg's stdin 'error' handler above deal with a broken pipe
      });
      req.pipe(session.proc.stdin, { end: false });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/ingest/stop') {
      const sessionId = url.searchParams.get('sessionId');
      if (!sessionId) {
        send(res, 400, { error: 'sessionId query param is required' });
        return;
      }
      stopIngest(sessionId);
      send(res, 200, { ok: true });
      return;
    }

    send(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('[relay] request error', err);
    if (!res.headersSent) send(res, 500, { error: 'Internal error' });
  }
});

server.listen(PORT, () => {
  console.log(`[relay] listening on port ${PORT}`);
});
