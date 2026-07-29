import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { notifyChurchNewFollower } from '@/lib/notifications';
import { trackEvent } from '@/lib/posthogServer';
import { sendOnceForKey } from '@/lib/behaviorEmails';
import { sendSeekerPowerUser3ChurchesEmail, sendPastorFollowerMilestoneEmail } from '@/lib/email';

const FOLLOWER_MILESTONES = [100, 500, 1000];

const schema = z.object({ churchSlug: z.string().min(1) });

export async function POST(req) {
  const { user, error } = await requireUser();
  if (error) return error;

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
  }

  const church = await prisma.church.findUnique({ where: { slug: input.churchSlug } });
  if (!church) {
    return NextResponse.json({ error: 'Church not found' }, { status: 404 });
  }

  const existing = await prisma.follow.findUnique({
    where: { seekerId_churchId: { seekerId: user.sub, churchId: church.id } },
  });

  if (existing) {
    await prisma.follow.delete({
      where: { seekerId_churchId: { seekerId: user.sub, churchId: church.id } },
    });
    trackEvent(user.sub, 'church_unfollowed', { churchId: church.id, churchSlug: church.slug }).catch((err) =>
      console.error('Failed to track unfollow event', err)
    );
    return NextResponse.json({ following: false });
  }

  await prisma.follow.create({
    data: { seekerId: user.sub, churchId: church.id },
  });

  const seeker = await prisma.user.findUnique({
    where: { id: user.sub },
    select: { email: true, fullName: true, emailVerified: true, marketingOptOut: true },
  });
  notifyChurchNewFollower(church, seeker).catch((err) => console.error('Failed to notify church of new follower', err));
  trackEvent(user.sub, 'church_followed', { churchId: church.id, churchSlug: church.slug }).catch((err) =>
    console.error('Failed to track follow event', err)
  );

  checkPowerUserMilestone(user.sub, seeker).catch((err) => console.error('Power-user milestone check failed', err));
  checkFollowerMilestone(church).catch((err) => console.error('Follower milestone check failed', err));

  return NextResponse.json({ following: true });
}

// Fires once, ever, the moment a seeker's follow count first reaches 3 —
// sendOnceForKey's dedup means a later unfollow/re-follow cycle back down
// to 3 won't re-trigger it.
async function checkPowerUserMilestone(seekerId, seeker) {
  if (!seeker?.emailVerified || seeker.marketingOptOut) return;
  const followCount = await prisma.follow.count({ where: { seekerId } });
  if (followCount !== 3) return;
  await sendOnceForKey(seekerId, 'seeker_power_user_3churches', () =>
    sendSeekerPowerUser3ChurchesEmail(seeker.email, { userId: seekerId, fullName: seeker.fullName, churchCount: followCount })
  );
}

// Fires once per milestone value the moment this follow is the one that
// pushes the church's follower count past it.
async function checkFollowerMilestone(church) {
  const followerCount = await prisma.follow.count({ where: { churchId: church.id } });
  const crossed = FOLLOWER_MILESTONES.find((m) => followerCount === m);
  if (!crossed) return;

  const owner = await prisma.user.findUnique({
    where: { id: church.ownerId },
    select: { id: true, email: true, fullName: true, emailVerified: true, marketingOptOut: true },
  });
  if (!owner?.emailVerified || owner.marketingOptOut) return;

  await sendOnceForKey(owner.id, `pastor_follower_milestone_${crossed}`, () =>
    sendPastorFollowerMilestoneEmail(owner.email, {
      userId: owner.id,
      fullName: owner.fullName,
      churchName: church.name,
      milestone: crossed,
    })
  );
}
