import webpush from 'web-push';
import { prisma } from '@/lib/prisma';

// Guarded rather than called unconditionally at module load — web-push
// throws immediately if either key is missing/malformed, which previously
// crashed *any* build/request that transitively imported this file (e.g.
// Next's build-time "Collecting page data" step) whenever VAPID_PUBLIC_KEY
// wasn't set on the environment, regardless of whether push was ever used.
const vapidConfigured = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (vapidConfigured) {
  webpush.setVapidDetails(
    'mailto:support@gospelgolive.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// Fans a browser push notification out to every subscription a user has
// (they may have several — one per browser/device). Best-effort: failures
// are swallowed per-subscription so one dead endpoint doesn't block the
// others, and a 404/410 (the push service telling us the subscription is
// gone — uninstalled, permissions revoked, browser data cleared) prunes
// that row instead of retrying it forever.
export async function sendPushToUsers(userIds, { title, body, url }) {
  if (!vapidConfigured) return;
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return;

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId: { in: ids } } });
  if (subscriptions.length === 0) return;

  const payload = JSON.stringify({ title, body: body || '', url: url || '/' });

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error('Push send failed', err.statusCode, err.body);
        }
      }
    })
  );
}
