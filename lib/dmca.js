import { prisma } from '@/lib/prisma';
import { getContentOwner, blockContent, suspendUserAccount } from '@/lib/moderation';
import { sendAccountSuspendedEmail, sendDmcaTakedownEmail, sendDmcaContentRestoredEmail } from '@/lib/email';

// ================================================================
// DMCA Copyright Policy enforcement — see the project's DMCA Copyright
// Policy doc, sections 1-5. Genuinely different shape from CSAM/nudity
// moderation (lib/moderation.js): removal is immediate on receipt of a
// valid notice rather than held for review (the admin recording the notice
// as valid *is* the review — see recordDmcaTakedown), and a removed piece
// of content has a specific legal path back (a counter-notice, followed by
// a 10-14 business day restoration window) rather than a generic appeal.
//
// Section 5's repeat infringer policy is the actual ask here: an account
// that racks up multiple valid, uncontested notices within a rolling window
// gets permanently suspended — same deactivatedAt mechanism CSAM uses, with
// no automatic reactivation path (an admin would have to intervene directly
// in the database, same accepted gap as CSAM). "Uncontested" matters: a
// counter-noticed notice no longer counts toward the threshold, since the
// account holder is actively disputing it.
// ================================================================

// Placeholder defaults matching the policy doc's own suggested example
// ("three valid notices within a 12-month period") — section 5 explicitly
// flags this threshold as not yet finalized with counsel. Override via env
// once it is.
const REPEAT_INFRINGER_THRESHOLD = Number(process.env.DMCA_REPEAT_INFRINGER_THRESHOLD || 3);
const REPEAT_INFRINGER_WINDOW_DAYS = Number(process.env.DMCA_REPEAT_INFRINGER_WINDOW_DAYS || 365);
// The DMCA requires restoration "10 to 14 business days" after a valid
// counter-notice absent a lawsuit (policy section 3) — 14 *calendar* days is
// used as a simple, conservative upper bound rather than computing business
// days, so content is never restored earlier than the law allows.
const COUNTER_NOTICE_RESTORE_DAYS = Number(process.env.DMCA_COUNTER_NOTICE_RESTORE_DAYS || 14);

const DAY_MS = 24 * 60 * 60 * 1000;

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Records a valid DMCA takedown notice against a specific sermon/stream and
// removes the content immediately (policy section 2 — there's no hold-for-
// review step; whoever is calling this has already determined the notice is
// complete and valid, which is why it requires the six statutory elements
// up front rather than accepting a bare removal request).
export async function recordDmcaTakedown({ contentType, contentId, adminUserId, claimant, copyrightedWorkDescription, goodFaithStatement, perjuryStatement, signature }) {
  if (!goodFaithStatement || !perjuryStatement || !signature) {
    throw new Error('A DMCA notice must include the good-faith statement, the perjury statement, and a signature to be legally effective — see policy section 1, items 1, 5, and 6');
  }
  if (!claimant?.name || !claimant?.email) {
    throw new Error('A DMCA notice must include the claimant\'s name and contact information — see policy section 1, item 4');
  }

  const owner = await getContentOwner(contentType, contentId);
  if (!owner) throw new Error('Content not found');

  const report = await prisma.contentReport.create({
    data: { contentType, contentId, category: 'copyright', detectionSource: 'user_report', status: 'actioned' },
  });

  const notice = await prisma.dmcaNotice.create({
    data: {
      reportId: report.id,
      claimantName: claimant.name,
      claimantEmail: claimant.email,
      claimantAddress: claimant.address || null,
      claimantPhone: claimant.phone || null,
      copyrightedWorkDescription,
      goodFaithStatement,
      perjuryStatement,
      signature,
      status: 'valid',
    },
  });

  await blockContent(contentType, contentId, 'removed');
  await prisma.moderationAction.create({
    data: {
      reportId: report.id,
      actionTaken: 'content_removed',
      actionedBy: adminUserId,
      notes: `DMCA takedown — claimant: ${claimant.name} <${claimant.email}>`,
    },
  });

  if (owner.email) {
    sendDmcaTakedownEmail(owner.email, {
      fullName: owner.fullName,
      contentTitle: owner.title,
      date: formatDate(new Date()),
      claimantName: claimant.name,
      copyrightedWorkDescription,
    }).catch((e) => console.error('Failed to send DMCA takedown email', e));
  }

  const repeatInfringer = await checkRepeatInfringer(owner.ownerId, report.id);

  return { report, notice, terminated: repeatInfringer.terminated, validNoticeCount: repeatInfringer.count };
}

// Counts this owner's other *valid* (not counter-noticed) copyright reports
// within the rolling window and, once the threshold is crossed, permanently
// suspends the account (policy section 5). contentId is polymorphic (no FK
// from ContentReport to Sermon/Stream), so this resolves ownership per
// report via getContentOwner rather than a single SQL join — acceptable at
// this scale, same tradeoff runDailyFraudSweep already makes in
// lib/detectSuspiciousGiving.js.
async function checkRepeatInfringer(ownerId, latestReportId) {
  const since = new Date(Date.now() - REPEAT_INFRINGER_WINDOW_DAYS * DAY_MS);

  const copyrightReports = await prisma.contentReport.findMany({
    where: { category: 'copyright', createdAt: { gte: since } },
    include: { dmcaNotice: true },
  });

  let count = 0;
  for (const report of copyrightReports) {
    if (report.dmcaNotice?.status !== 'valid') continue; // counter-noticed/restored/invalid — no longer "uncontested"
    const contentOwner = await getContentOwner(report.contentType, report.contentId);
    if (contentOwner?.ownerId === ownerId) count += 1;
  }

  if (count < REPEAT_INFRINGER_THRESHOLD) return { terminated: false, count };

  // Already terminated by an earlier notice — don't re-suspend/re-email on
  // every subsequent one.
  const user = await prisma.user.findUnique({ where: { id: ownerId }, select: { deactivatedAt: true, email: true, fullName: true } });
  if (user?.deactivatedAt) return { terminated: false, count };

  const reason = `Repeat copyright infringement — ${count} valid DMCA takedown notices within ${REPEAT_INFRINGER_WINDOW_DAYS} days`;
  await suspendUserAccount(ownerId, reason);
  await prisma.moderationAction.create({
    data: { reportId: latestReportId, actionTaken: 'account_terminated', actionedBy: 'system', notes: reason },
  });

  if (user?.email) {
    sendAccountSuspendedEmail(user.email, {
      fullName: user.fullName,
      reason: 'repeated, uncontested DMCA copyright takedown notices against your account, consistent with our repeat infringer policy',
    }).catch((e) => console.error('Failed to send account-terminated email', e));
  }

  return { terminated: true, count };
}

// Records that the account holder filed a counter-notice against a
// takedown (policy section 3). Stops the notice from counting toward the
// repeat-infringer threshold going forward (it's no longer "uncontested")
// and starts the clock on the mandatory restoration window.
export async function recordCounterNotice(noticeId, { adminUserId, notes = null }) {
  const notice = await prisma.dmcaNotice.findUnique({ where: { id: noticeId } });
  if (!notice) throw new Error('Notice not found');
  if (notice.status !== 'valid') throw new Error(`Notice is already "${notice.status}" — a counter-notice can only be recorded against a currently-valid notice`);

  const now = new Date();
  await prisma.dmcaNotice.update({
    where: { id: noticeId },
    data: {
      status: 'counter_noticed',
      counterNoticeAt: now,
      restoreEligibleAt: new Date(now.getTime() + COUNTER_NOTICE_RESTORE_DAYS * DAY_MS),
    },
  });
  await prisma.moderationAction.create({
    data: { reportId: notice.reportId, actionTaken: 'counter_notice_recorded', actionedBy: adminUserId, notes },
  });
}

// Records that the original claimant notified us they've filed a lawsuit —
// this blocks the automatic restore below regardless of restoreEligibleAt
// (policy section 3: "Unless that party notifies us that they've filed a
// lawsuit... we will restore the material").
export async function markLitigationFiled(noticeId, { adminUserId, notes = null }) {
  const notice = await prisma.dmcaNotice.findUnique({ where: { id: noticeId } });
  if (!notice) throw new Error('Notice not found');
  if (notice.status !== 'counter_noticed') throw new Error('Litigation can only be recorded against a counter-noticed notice');

  await prisma.dmcaNotice.update({ where: { id: noticeId }, data: { litigationFiledAt: new Date() } });
  await prisma.moderationAction.create({
    data: { reportId: notice.reportId, actionTaken: 'litigation_filed', actionedBy: adminUserId, notes },
  });
}

// Daily sweep (see app/api/cron/dmca-restore) — restores content whose
// counter-notice window has passed without the claimant filing suit.
export async function runDailyDmcaRestoreSweep() {
  const dueNotices = await prisma.dmcaNotice.findMany({
    where: { status: 'counter_noticed', litigationFiledAt: null, restoreEligibleAt: { lte: new Date() } },
    include: { report: true },
  });

  let restored = 0;
  for (const notice of dueNotices) {
    try {
      await blockContent(notice.report.contentType, notice.report.contentId, 'clean');
      await prisma.dmcaNotice.update({ where: { id: notice.id }, data: { status: 'restored', restoredAt: new Date() } });
      await prisma.moderationAction.create({
        data: { reportId: notice.reportId, actionTaken: 'content_restored', actionedBy: 'system', notes: 'Counter-notice window elapsed with no lawsuit filed' },
      });

      const owner = await getContentOwner(notice.report.contentType, notice.report.contentId);
      if (owner?.ownerId) {
        const ownerUser = await prisma.user.findUnique({ where: { id: owner.ownerId }, select: { email: true, fullName: true } });
        if (ownerUser) {
          sendDmcaContentRestoredEmail(ownerUser.email, {
            fullName: ownerUser.fullName,
            contentTitle: owner.title,
            date: formatDate(new Date()),
          }).catch((e) => console.error('Failed to send DMCA content-restored email', e));
        }
      }
      restored += 1;
    } catch (err) {
      console.error(`Failed to restore DMCA notice ${notice.id}`, err);
    }
  }

  return { checked: dueNotices.length, restored };
}
