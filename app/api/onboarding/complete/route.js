import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { INTERESTS } from '@/lib/interests';

const schema = z.object({
  interests: z.array(z.enum(INTERESTS)).length(3),
});

// Finishes the new-signup-only onboarding step (see User.onboardingCompletedAt
// in prisma/schema.prisma): exactly 3 interest categories, plus already
// following at least 2 churches — required for every role now, not just
// seekers, so a pastor also follows 2 peer churches before finishing setup.
// The follow count is re-checked here rather than trusted from the client;
// the onboarding UI itself performs each follow via the existing
// /api/follows/toggle route before ever calling this one (which has no role
// restriction, so a pastor's follows land in the same table).
export async function POST(req) {
  const { user, error } = await requireUser();
  if (error) return error;

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Please select exactly 3 interest categories.' }, { status: 400 });
  }

  const followCount = await prisma.follow.count({ where: { seekerId: user.sub } });
  if (followCount < 2) {
    return NextResponse.json(
      { error: 'Please follow at least 2 churches before finishing setup.', code: 'FOLLOWS_REQUIRED' },
      { status: 400 }
    );
  }

  if (user.role === 'seeker') {
    await prisma.user.update({
      where: { id: user.sub },
      data: { interests: input.interests, onboardingCompletedAt: new Date() },
    });
  } else {
    const church = await prisma.church.findFirst({ where: { ownerId: user.sub } });
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.sub }, data: { onboardingCompletedAt: new Date() } }),
      ...(church ? [prisma.church.update({ where: { id: church.id }, data: { interests: input.interests } })] : []),
    ]);
  }

  return NextResponse.json({ ok: true });
}
