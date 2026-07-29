import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const MAX_WATCH_SECONDS = 24 * 60 * 60;

// Updates the running watch-time total for a view session. Called
// periodically (and on close) by the player — an absolute value rather than
// an increment, since the client already tracks elapsed playback time.
export async function PATCH(req, { params }) {
  const { id } = await params;

  let body;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const watchSeconds = Math.min(MAX_WATCH_SECONDS, Math.max(0, Math.round(Number(body?.watchSeconds) || 0)));

  const existing = await prisma.viewEvent.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: 'View event not found' }, { status: 404 });

  // Bumping lastHeartbeatAt keeps this row counting toward the stream's
  // concurrent-viewer cap (see POST above) for as long as heartbeats keep
  // arriving — a stale/abandoned session ages out after the grace window.
  await prisma.viewEvent.update({ where: { id }, data: { watchSeconds, lastHeartbeatAt: new Date() } });
  return NextResponse.json({ success: true });
}
