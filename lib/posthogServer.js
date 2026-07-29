import { PostHog } from 'posthog-node';

// flushAt: 1 / flushInterval: 0 — Next.js API routes run as short-lived
// serverless functions that can exit right after the response is sent, before
// posthog-node's default batching timer would ever fire. Sending immediately
// (and the caller awaiting flush()) is what actually gets the event delivered.
const posthog = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  flushAt: 1,
  flushInterval: 0,
});

// Callers should fire-and-forget with .catch() (same pattern as
// lib/notifications.js) rather than block the response on analytics.
export async function trackEvent(distinctId, event, properties) {
  posthog.capture({ distinctId, event, properties });
  await posthog.flush();
}
