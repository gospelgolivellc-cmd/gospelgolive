import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';

// Browsers can't speak RTMP, so a pastor going live "from this browser"
// (webcam, no OBS) works by: getUserMedia -> MediaRecorder (webm chunks) ->
// this relay -> ffmpeg (re-encode to h264/aac) -> RTMP -> Mux. One ffmpeg
// child process per church, kept in memory for the life of this server
// process. Not meant to survive a serverless/multi-instance deploy — same
// caveat as the local-disk upload storage noted elsewhere in this project.
const globalForIngest = globalThis;
const sessions = globalForIngest.__liveIngestSessions ?? new Map();
if (process.env.NODE_ENV !== 'production') {
  globalForIngest.__liveIngestSessions = sessions;
}

const IDLE_TIMEOUT_MS = 20000;
const SWEEP_INTERVAL_MS = 10000;

function sweepStaleSessions() {
  const now = Date.now();
  for (const [churchId, session] of sessions.entries()) {
    if (now - session.lastChunkAt > IDLE_TIMEOUT_MS) {
      console.warn(`[live-ingest] killing stale session for church ${churchId} (no chunks for 20s)`);
      stopIngest(churchId);
    }
  }
}

if (!globalForIngest.__liveIngestSweepInterval) {
  globalForIngest.__liveIngestSweepInterval = setInterval(sweepStaleSessions, SWEEP_INTERVAL_MS);
  globalForIngest.__liveIngestSweepInterval.unref?.();
}

export function startIngest(churchId, rtmpUrl, streamKey, container = 'webm') {
  stopIngest(churchId); // idempotent — only one active browser session per church

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
      // Explicit HD-friendly bitrate cap — the browser now captures at up to
      // 1080p (see getUserMedia constraints in mockup.html), so this needs to
      // be high enough to actually carry that, not just whatever libx264's
      // CRF default would pick.
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
    console.error(`[live-ingest ${churchId}]`, chunk.toString());
  });
  proc.stdin.on('error', () => {
    // ffmpeg died mid-write (EPIPE) — the exit handler below cleans up the session.
  });
  proc.on('exit', (code) => {
    console.log(`[live-ingest ${churchId}] ffmpeg exited (code ${code})`);
    sessions.delete(churchId);
  });

  sessions.set(churchId, { proc, lastChunkAt: Date.now() });
  return proc;
}

// Returns false if there's no active session (or it's already gone) so the
// route can tell the client to stop and restart.
export function writeChunk(churchId, buffer) {
  const session = sessions.get(churchId);
  if (!session || session.proc.stdin.destroyed) return false;
  session.lastChunkAt = Date.now();
  try {
    session.proc.stdin.write(buffer);
    return true;
  } catch {
    return false;
  }
}

export function stopIngest(churchId) {
  const session = sessions.get(churchId);
  if (!session) return;
  sessions.delete(churchId);
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

export function isIngesting(churchId) {
  return sessions.has(churchId);
}
