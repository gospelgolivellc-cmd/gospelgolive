import { prisma } from '@/lib/prisma';

// 2x the client's 15s live heartbeat interval — a generous grace window so a
// single missed beat doesn't drop a viewer from the concurrency count.
export const HEARTBEAT_GRACE_MS = 30_000;

export async function getLiveViewerCount(streamId) {
  return prisma.viewEvent.count({
    where: { streamId, lastHeartbeatAt: { gte: new Date(Date.now() - HEARTBEAT_GRACE_MS) } },
  });
}
