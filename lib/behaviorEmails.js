import { prisma } from '@/lib/prisma';

// ================================================================
// Dedup — generic per-user "have we already sent this exact occurrence"
// check, backed by BehaviorEmailLog. Every recurring check (inactivity,
// monthly giving comparison, streaks, cap-hits) builds `emailKey` to embed
// an anchor for the *current* occurrence (e.g. the user's lastLoginAt date,
// the current year-month, the id of the triggering row) so a resolved
// episode naturally produces a fresh key next time — no separate
// "has this reset" logic needed, just a well-chosen key per call site.
// ================================================================

export async function wasEmailSent(userId, emailKey) {
  const row = await prisma.behaviorEmailLog.findUnique({
    where: { userId_emailKey: { userId, emailKey } },
    select: { id: true },
  });
  return Boolean(row);
}

export async function markEmailSent(userId, emailKey) {
  await prisma.behaviorEmailLog.upsert({
    where: { userId_emailKey: { userId, emailKey } },
    create: { userId, emailKey },
    update: {},
  });
}

// Combines the check + send + mark into one call so cron routes don't
// repeat the same three-step dance for every single email. `send` is only
// invoked if the key hasn't fired before; only marked sent if `send`
// resolves without throwing.
export async function sendOnceForKey(userId, emailKey, send) {
  if (await wasEmailSent(userId, emailKey)) return false;
  await send();
  await markEmailSent(userId, emailKey);
  return true;
}

// ================================================================
// Cap-hit logging — called from the three existing cap-check rejection
// points (view-events, sermons/upload, donations/intent|subscription).
// Unique on (churchId, capType, contextId), so a second rejected request
// within the same stream/window is a silent no-op, not a duplicate row —
// "3 consecutive streams hit the cap" then just counts distinct rows.
// ================================================================

export async function logCapHit(churchId, capType, contextId = null) {
  try {
    await prisma.planCapHit.create({ data: { churchId, capType, contextId } });
  } catch (err) {
    if (err.code !== 'P2002') throw err;
  }
}

// ================================================================
// Consecutive-week streak — shared by the seeker engagement streak
// (ViewEvent/Donation timestamps) and the pastor streaming streak
// (Stream.startedAt timestamps). Caller fetches whichever timestamps count
// as "activity" for their case; this just does the week-bucketing math.
// ================================================================

function weekStart(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d;
}

function weekKey(date) {
  return weekStart(date).toISOString().slice(0, 10);
}

// Returns the number of consecutive ISO weeks, ending with the current
// week, that have at least one timestamp in `timestamps` — plus the start
// of that streak's first week, for building a stable per-streak dedup key.
export function consecutiveWeekStreak(timestamps) {
  const weeksWithActivity = new Set(timestamps.map(weekKey));
  let length = 0;
  let cursor = weekStart(new Date());
  let streakStartWeekKey = null;
  while (weeksWithActivity.has(weekKey(cursor))) {
    length += 1;
    streakStartWeekKey = weekKey(cursor);
    cursor = new Date(cursor);
    cursor.setUTCDate(cursor.getUTCDate() - 7);
  }
  return { length, streakStartWeekKey };
}
