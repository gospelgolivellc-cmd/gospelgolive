import { prisma } from '@/lib/prisma';
import { mux } from '@/lib/mux';
import { sendAccountSuspendedEmail, sendContentRemovedEmail } from '@/lib/email';

// ================================================================
// Trust & Safety content moderation — see the project's Trust & Safety
// Protocol doc, sections A (CSAM) and B (general nudity/inappropriate
// content). Two genuinely different response models, deliberately kept
// separate: CSAM has zero human discretion (a hash match is already
// NCMEC-confirmed before it enters the vendor's database — there's nothing
// left for a moderator to "confirm"), general nudity is confidence-scored
// and always held for a human review-queue decision (see reviewContentReport
// below and app/api/admin/reports).
//
// Both categories suspend the content owner's account the moment they're
// detected, not just the content (see suspendOwnerAccount) — CSAM's
// suspension is permanent (no path back, matching its zero-discretion
// policy), nudity's is provisional and gets reversed automatically if a
// human reviewer clears the report as a false positive
// (reactivateOwnerAccount, wired into reviewContentReport's 'approve' path).
// ================================================================

// Nudity scanning goes through Hive AI's V3 Visual Moderation endpoint —
// confirmed working directly against the live API with the project's actual
// key (V2's /api/v2/task/sync, documented on docs.thehive.ai, rejected this
// key entirely; V3 is what this key is actually provisioned for). Per
// Hive's own docs, V3 is explicitly "for developer testing ONLY: 100
// requests/day limit" — worth watching, since app/api/cron/moderate-live-streams
// runs once a minute per live stream and moderateSermon below samples 3
// frames per sermon; either could burn through that quickly. Upgrade to a
// V2 Enterprise project (higher limits, still self-serve-adjacent) once
// usage justifies it.
//
// CSAM detection is a completely separate Hive "Project", Enterprise-only,
// provisioned by a Hive rep with its own dedicated key that must not be
// reused from a Visual Moderation project (see "CSAM Detection - Combined
// API" > "Integrating with the CSAM Detection API" on docs.thehive.ai).
// CSAM_API_KEY has no fallback to HIVE_API_KEY and stays unset until that's
// actually provisioned.
const NUDITY_API_URL = process.env.NUDITY_API_URL || 'https://api.thehive.ai/api/v3/hive/visual-moderation';
const NUDITY_API_KEY = process.env.NUDITY_API_KEY || process.env.HIVE_API_KEY;
const CSAM_API_URL = process.env.CSAM_API_URL || 'https://api.thehive.ai/api/v2/task/sync';
const CSAM_API_KEY = process.env.CSAM_API_KEY;

// Confidence scores are 0-100. Below the hold threshold: auto-published, no
// report. Between hold and terminate: VOD content is held for human review
// before ever going public; a live stream (already being watched in real
// time) is force-terminated instead of held, then queued for a human to
// review the recording afterward. Hive's own docs recommend a 0.9 (90/100)
// threshold as "a good place to start" for optimized model performance —
// used directly for the live-terminate bar (a disruptive, irreversible
// action worth being conservative about), and slightly relaxed for the
// pre-publish hold (lower stakes: it just adds an item to the review queue).
const NUDITY_HOLD_THRESHOLD = Number(process.env.NUDITY_HOLD_THRESHOLD || 75);
const NUDITY_LIVE_TERMINATE_THRESHOLD = Number(process.env.NUDITY_LIVE_TERMINATE_THRESHOLD || 90);

// 18 U.S.C. § 2258A(h) — reported CSAM and associated records must be
// preserved for 90 days from the report, extendable to 180 if law
// enforcement asks. Extend content_reports.retainUntil by hand if that
// request comes in; this is just the initial 90-day floor.
const CSAM_RETENTION_DAYS = 90;

// Hive's V3 visual-moderation endpoint takes a JSON body — { input: [{
// media_url }] } — and authenticates with a plain `Authorization: Bearer
// <key>` header. Confirmed directly against the live API (2026-07-22): a
// real demo NSFW image returned a 200 with output[0].classes as an array of
// { class, value } (0-1 floats) — note "value", not "score" as V2's docs use.
async function callHiveVisualModerationV3(imageUrl) {
  if (!NUDITY_API_URL || !NUDITY_API_KEY) {
    console.error('[moderation] Nudity scan skipped — no vendor configured (set NUDITY_API_KEY / HIVE_API_KEY)');
    return null;
  }
  try {
    const res = await fetch(NUDITY_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${NUDITY_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: [{ media_url: imageUrl }] }),
    });
    if (!res.ok) {
      console.error(`[moderation] Nudity vendor call failed with status ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error('[moderation] Nudity vendor call threw', err);
    return null;
  }
}

// Hive's V2 sync task endpoint (what CSAM Detection is documented against)
// takes multipart form data (a `url` field) and authenticates with
// `Authorization: token <key>` (lowercase "token", not "Bearer") — see
// docs.thehive.ai "Visual Moderation - Overview" > Quickstart (V2). Unlike
// the V3 call above, this hasn't been verified against a live key yet since
// no CSAM Detection Project exists — confirm once one is provisioned.
async function callHiveCsamV2(imageUrl) {
  if (!CSAM_API_URL || !CSAM_API_KEY) {
    console.error('[moderation] CSAM scan skipped — no vendor configured (set CSAM_API_KEY once a dedicated CSAM Detection Project exists)');
    return null;
  }
  try {
    const form = new FormData();
    form.append('url', imageUrl);
    const res = await fetch(CSAM_API_URL, {
      method: 'POST',
      headers: { Authorization: `token ${CSAM_API_KEY}`, Accept: 'application/json' },
      body: form,
    });
    if (!res.ok) {
      console.error(`[moderation] CSAM vendor call failed with status ${res.status} — if 401/403, double check this key is the dedicated CSAM Detection Project key, not the Visual Moderation one`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error('[moderation] CSAM vendor call threw', err);
    return null;
  }
}

// Returns { matched, confidenceScore }. Hive's Combined CSAM API (Thorn
// hash-matching + a novel-CSAM classifier) returns hash matches plus a
// classifierPrediction with pornography/csam/other scores summing to 1 — the
// exact JSON field names below are the best available from Hive's docs
// overview page; confirm them against the literal API reference page once a
// CSAM Detection Project actually exists (Enterprise-only, provisioned by a
// Hive rep — see the comment above CSAM_API_KEY). matched is only ever true
// for an actual hash match or a classifier CSAM score, never a heuristic.
export async function scanImageForCsam(imageUrl) {
  const result = await callHiveCsamV2(imageUrl);
  if (!result) return { matched: false, skipped: true };
  const hashMatched = Array.isArray(result.hash_matches) && result.hash_matches.length > 0;
  const classifierScore = result.classifierPrediction?.csam ?? 0;
  const confidenceScore = Math.round(Math.max(hashMatched ? 1 : 0, classifierScore) * 100);
  return { matched: hashMatched || classifierScore >= 0.9, confidenceScore, skipped: false };
}

// Returns { flagged, confidenceScore } against NUDITY_HOLD_THRESHOLD. Reads
// the `general_nsfw` class value off Hive's Visual Moderation NSFW head —
// see docs.thehive.ai "Visual Moderation - Overview" for the full class list
// (general_nsfw / general_suggestive / general_not_nsfw_not_suggestive).
export async function scanImageForNudity(imageUrl) {
  const result = await callHiveVisualModerationV3(imageUrl);
  if (!result) return { flagged: false, confidenceScore: 0, skipped: true };
  const classes = result.output?.[0]?.classes || [];
  const nsfwValue = classes.find((c) => c.class === 'general_nsfw')?.value ?? 0;
  const confidenceScore = Math.round(nsfwValue * 100);
  return { flagged: confidenceScore >= NUDITY_HOLD_THRESHOLD, confidenceScore, skipped: false };
}

// Mux thumbnail JPEGs (no video download needed) — evenly spaced across the
// asset's duration for VOD, or just "right now" for a live stream (time
// omitted). See https://docs.mux.com/guides/get-images-from-a-video for the
// URL shape this depends on.
export function sampleThumbnailUrls(playbackId, durationSeconds) {
  if (!playbackId) return [];
  if (!durationSeconds || durationSeconds <= 0) {
    return [`https://image.mux.com/${playbackId}/thumbnail.jpg`];
  }
  return [0.1, 0.5, 0.9].map(
    (fraction) => `https://image.mux.com/${playbackId}/thumbnail.jpg?time=${Math.floor(durationSeconds * fraction)}`
  );
}

async function recordContentReport({ contentType, contentId, category, detectionSource, reporterId = null, status, confidenceScore = null, retainDays = null }) {
  return prisma.contentReport.create({
    data: {
      contentType,
      contentId,
      category,
      detectionSource,
      status,
      reporterId,
      confidenceScore,
      retainUntil: retainDays ? new Date(Date.now() + retainDays * 24 * 60 * 60 * 1000) : null,
    },
  });
}

async function recordModerationAction({ reportId, actionTaken, actionedBy, notes = null }) {
  return prisma.moderationAction.create({ data: { reportId, actionTaken, actionedBy, notes } });
}

// Exported so lib/dmca.js can set moderationStatus directly (content_removed
// on takedown, content_restored on a successful counter-notice) without
// duplicating this sermon-vs-stream dispatch.
export async function blockContent(contentType, contentId, status) {
  if (contentType === 'sermon') {
    await prisma.sermon.update({ where: { id: contentId }, data: { moderationStatus: status } });
  } else if (contentType === 'stream') {
    await prisma.stream.update({ where: { id: contentId }, data: { moderationStatus: status } });
  }
}

// Exported so lib/dmca.js's repeat-infringer tracking can resolve which
// account owns a piece of flagged content without duplicating this lookup.
export async function getContentOwner(contentType, contentId) {
  const select = { church: { select: { name: true, ownerId: true } }, title: true };
  if (contentType === 'sermon') {
    const sermon = await prisma.sermon.findUnique({ where: { id: contentId }, select });
    return sermon ? { churchName: sermon.church.name, ownerId: sermon.church.ownerId, title: sermon.title } : null;
  }
  if (contentType === 'stream') {
    const stream = await prisma.stream.findUnique({ where: { id: contentId }, select });
    return stream ? { churchName: stream.church.name, ownerId: stream.church.ownerId, title: stream.title } : null;
  }
  return null;
}

async function terminateLiveStream(stream) {
  if (!stream.muxLiveStreamId) return;
  try {
    await mux.video.liveStreams.signalComplete(stream.muxLiveStreamId);
  } catch (err) {
    console.error(`Failed to force-terminate Mux live stream ${stream.muxLiveStreamId}`, err);
  }
}

// Suspends a specific account directly by id — reuses the same
// deactivatedAt gate self-deactivation uses (blocks sign-in, drops the
// church from Browse/Popular/Live/feed), with suspensionReason set so it
// reads as a T&S action rather than the owner's own choice. Exported for
// lib/dmca.js's repeat-infringer termination, which suspends an account
// directly (it already knows the ownerId — it's aggregating across several
// pieces of content, not reacting to one) rather than via a single piece of
// content the way suspendOwnerAccount below does.
export async function suspendUserAccount(userId, reason) {
  await prisma.user.update({
    where: { id: userId },
    data: { deactivatedAt: new Date(), suspensionReason: reason },
  });
  return prisma.user.findUnique({ where: { id: userId }, select: { email: true, fullName: true } });
}

// Suspends the church owner's account the moment CSAM or nudity is detected
// on their content. Shared by both the CSAM pipeline (permanent — see
// reviewContentReport's refusal to touch csam reports) and the nudity
// pipeline (reversible — see reactivateOwnerAccount below).
async function suspendOwnerAccount(contentType, contentId, reason) {
  const owner = await getContentOwner(contentType, contentId);
  if (!owner) return null;
  const ownerUser = await suspendUserAccount(owner.ownerId, reason);
  return ownerUser ? { ...owner, email: ownerUser.email, fullName: ownerUser.fullName } : owner;
}

// Reverses suspendOwnerAccount once a human reviewer clears a nudity report
// as a false positive (reviewContentReport's 'approve' path). Guarded on
// suspensionReason still being set so this can never accidentally reactivate
// an account that separately self-deactivated in the meantime, or clobber a
// suspension a *different*, still-open report caused.
async function reactivateOwnerAccount(contentType, contentId) {
  const owner = await getContentOwner(contentType, contentId);
  if (!owner) return;
  await prisma.user.updateMany({
    where: { id: owner.ownerId, suspensionReason: { not: null } },
    data: { deactivatedAt: null, suspensionReason: null },
  });
}

// The automatic, zero-discretion CSAM pipeline (Trust & Safety Protocol
// section A). No human reviewer sits in this path — a hash match against
// Safer's database has already been confirmed by NCMEC analysts before it
// ever entered that database, so there is nothing left to "confirm".
// contentId is a Sermon.id or Stream.id depending on contentType.
export async function handleCsamDetected({ contentType, contentId, confidenceScore = null }) {
  const owner = await getContentOwner(contentType, contentId);

  const report = await recordContentReport({
    contentType,
    contentId,
    category: 'csam',
    detectionSource: 'automated',
    status: 'actioned',
    confidenceScore,
    retainDays: CSAM_RETENTION_DAYS,
  });

  await blockContent(contentType, contentId, 'blocked');
  await recordModerationAction({ reportId: report.id, actionTaken: 'content_blocked', actionedBy: 'system' });

  if (contentType === 'stream') {
    const stream = await prisma.stream.findUnique({ where: { id: contentId } });
    if (stream?.status === 'live') {
      await terminateLiveStream(stream);
      await recordModerationAction({ reportId: report.id, actionTaken: 'stream_terminated', actionedBy: 'system' });
    }
  }

  if (owner) {
    const suspended = await suspendOwnerAccount(contentType, contentId, 'CSAM detected on account content');
    await recordModerationAction({ reportId: report.id, actionTaken: 'account_suspended', actionedBy: 'system' });

    if (suspended?.email) {
      sendAccountSuspendedEmail(suspended.email, {
        fullName: suspended.fullName,
        reason: 'a violation of our zero-tolerance policy on child sexual abuse material',
      }).catch((e) => console.error('Failed to send account-suspended email', e));
    }
  }

  // Thorn Safer Match / Hive's CSAM API handle the actual NCMEC CyberTipline
  // submission as part of the vendor service itself once under contract —
  // this just records that the report happened in our own audit trail so
  // it's independently reconstructable if law enforcement or NCMEC follows
  // up. Do not build a separate direct NCMEC API integration here; that path
  // goes through whichever vendor is contracted.
  await recordModerationAction({
    reportId: report.id,
    actionTaken: 'ncmec_reported',
    actionedBy: 'system',
    notes: 'Reported via vendor CSAM API integration; evidence retained per 18 U.S.C. § 2258A(h).',
  });

  return report;
}

// General nudity/inappropriate content on VOD (pre-publish) — held for a
// human review-queue decision, never auto-published and never auto-removed.
// The owner's account is suspended immediately too (not just the content) —
// unlike CSAM this is reversible: reviewContentReport's 'approve' path
// (a confirmed false positive) reactivates the account via
// reactivateOwnerAccount; 'remove' (confirmed violation) leaves it suspended.
export async function handleNudityFlaggedPrePublish({ contentType, contentId, confidenceScore }) {
  const report = await recordContentReport({
    contentType,
    contentId,
    category: 'nudity',
    detectionSource: 'automated',
    status: 'pending',
    confidenceScore,
  });
  await blockContent(contentType, contentId, 'pending_review');

  const suspended = await suspendOwnerAccount(contentType, contentId, 'Content flagged for inappropriate material — pending human review');
  if (suspended) {
    await recordModerationAction({ reportId: report.id, actionTaken: 'account_suspended', actionedBy: 'system' });
    if (suspended.email) {
      sendAccountSuspendedEmail(suspended.email, {
        fullName: suspended.fullName,
        reason: 'content flagged by our automated moderation system as potentially violating our community guidelines, pending human review',
      }).catch((e) => console.error('Failed to send account-suspended email', e));
    }
  }

  return report;
}

// General nudity/inappropriate content on a *live* stream — unlike VOD there
// is no safe way to "hold" something already being broadcast, so a
// confidence score over NUDITY_LIVE_TERMINATE_THRESHOLD force-terminates the
// stream immediately and queues the incident for human review afterward
// (the report starts 'under_review', not 'pending', since the automated
// system already acted rather than waiting on a reviewer).
export async function handleNudityFlaggedLive({ streamId, confidenceScore }) {
  const stream = await prisma.stream.findUnique({ where: { id: streamId } });
  if (!stream) return null;

  const report = await recordContentReport({
    contentType: 'stream',
    contentId: streamId,
    category: 'nudity',
    detectionSource: 'automated',
    status: 'under_review',
    confidenceScore,
  });

  await blockContent('stream', streamId, 'removed');
  await recordModerationAction({ reportId: report.id, actionTaken: 'content_removed', actionedBy: 'system' });

  if (stream.status === 'live') {
    await terminateLiveStream(stream);
    await recordModerationAction({ reportId: report.id, actionTaken: 'stream_terminated', actionedBy: 'system' });
  }

  const suspended = await suspendOwnerAccount('stream', streamId, 'A live stream was flagged and ended for inappropriate material — pending human review');
  if (suspended) {
    await recordModerationAction({ reportId: report.id, actionTaken: 'account_suspended', actionedBy: 'system' });
    if (suspended.email) {
      sendAccountSuspendedEmail(suspended.email, {
        fullName: suspended.fullName,
        reason: 'a live stream flagged by our automated moderation system as potentially violating our community guidelines, pending human review',
      }).catch((e) => console.error('Failed to send account-suspended email', e));
    }
  }

  return report;
}

// Admin review-queue decision (Trust & Safety Protocol section E — "a human
// review queue is non-negotiable"). Only ever applies to non-CSAM reports —
// there is deliberately no "approve" path back from a CSAM block.
export async function reviewContentReport(reportId, { decision, adminUserId, notes = null }) {
  const report = await prisma.contentReport.findUnique({ where: { id: reportId } });
  if (!report) throw new Error('Report not found');
  if (report.category === 'csam') throw new Error('CSAM reports cannot be reviewed/reversed through this path');
  if (report.category === 'copyright') throw new Error('DMCA reports have their own workflow — see lib/dmca.js (counter-notice / litigation-filed), not this generic approve/remove path');

  const owner = await getContentOwner(report.contentType, report.contentId);

  if (decision === 'approve') {
    await blockContent(report.contentType, report.contentId, 'clean');
    await prisma.contentReport.update({ where: { id: reportId }, data: { status: 'dismissed' } });
    await recordModerationAction({ reportId, actionTaken: 'report_dismissed', actionedBy: adminUserId, notes });

    // A false positive — this report is what suspended the account (see
    // handleNudityFlaggedPrePublish/handleNudityFlaggedLive), so clearing it
    // reactivates the owner too. No-ops harmlessly if some other still-open
    // report is what's actually keeping them suspended (reactivateOwnerAccount
    // only clears when suspensionReason is currently set).
    await reactivateOwnerAccount(report.contentType, report.contentId);
    await recordModerationAction({ reportId, actionTaken: 'account_reactivated', actionedBy: adminUserId, notes });

    return { decision: 'approve' };
  }

  if (decision === 'remove') {
    await blockContent(report.contentType, report.contentId, 'removed');
    await prisma.contentReport.update({ where: { id: reportId }, data: { status: 'actioned' } });
    await recordModerationAction({ reportId, actionTaken: 'content_removed', actionedBy: adminUserId, notes });
    // Account stays suspended — it was already suspended at detection time
    // (see handleNudityFlaggedPrePublish/handleNudityFlaggedLive); confirming
    // the violation is a reason to keep it that way, not a new action.

    if (owner) {
      const ownerUser = await prisma.user.findUnique({ where: { id: owner.ownerId }, select: { email: true, fullName: true } });
      if (ownerUser) {
        sendContentRemovedEmail(ownerUser.email, {
          fullName: ownerUser.fullName,
          contentTitle: owner.title,
          date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
          reason: notes || 'a violation of our community guidelines',
        }).catch((e) => console.error('Failed to send content-removed email', e));
      }
    }
    return { decision: 'remove' };
  }

  throw new Error(`Unknown decision "${decision}" — expected "approve" or "remove"`);
}

// Runs the full pre-publish scan for a just-ready sermon and returns whether
// it's clear to notify followers. Callers (the Mux webhook and its
// local-dev polling fallback) are responsible for only calling
// notifySermonReady when publishable is true.
export async function moderateSermon(sermon) {
  const samples = sampleThumbnailUrls(sermon.playbackId, sermon.durationSeconds);
  if (samples.length === 0) {
    // No playback id to sample yet — shouldn't happen once asset.ready has
    // fired, but fail closed (hold for review) rather than silently publish.
    await handleNudityFlaggedPrePublish({ contentType: 'sermon', contentId: sermon.id, confidenceScore: null });
    return { publishable: false };
  }

  for (const url of samples) {
    const csam = await scanImageForCsam(url);
    if (csam.matched) {
      await handleCsamDetected({ contentType: 'sermon', contentId: sermon.id, confidenceScore: csam.confidenceScore });
      return { publishable: false };
    }
  }

  let worstNudity = { flagged: false, confidenceScore: 0 };
  for (const url of samples) {
    const nudity = await scanImageForNudity(url);
    if (nudity.confidenceScore > worstNudity.confidenceScore) worstNudity = nudity;
  }
  if (worstNudity.flagged) {
    await handleNudityFlaggedPrePublish({ contentType: 'sermon', contentId: sermon.id, confidenceScore: worstNudity.confidenceScore });
    return { publishable: false };
  }

  await prisma.sermon.update({ where: { id: sermon.id }, data: { moderationStatus: 'clean' } });
  return { publishable: true };
}

// One frame-sample check for a currently-live stream — called repeatedly by
// app/api/cron/moderate-live-streams. Returns { terminated } so the caller
// can skip re-checking a stream that just got cut.
export async function moderateLiveStreamFrame(stream) {
  const [url] = sampleThumbnailUrls(stream.playbackId, null);
  if (!url) return { terminated: false };

  const csam = await scanImageForCsam(url);
  if (csam.matched) {
    await handleCsamDetected({ contentType: 'stream', contentId: stream.id, confidenceScore: csam.confidenceScore });
    return { terminated: true };
  }

  const nudity = await scanImageForNudity(url);
  if (nudity.confidenceScore >= NUDITY_LIVE_TERMINATE_THRESHOLD) {
    await handleNudityFlaggedLive({ streamId: stream.id, confidenceScore: nudity.confidenceScore });
    return { terminated: true };
  }

  return { terminated: false };
}
