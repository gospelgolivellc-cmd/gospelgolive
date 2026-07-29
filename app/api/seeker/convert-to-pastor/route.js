import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser, signSession, signPartialSession, setSessionCookie } from '@/lib/auth';
import { slugify, uniqueChurchSlug } from '@/lib/slug';
import { isTwoFactorEnforced } from '@/lib/twoFactor';

const schema = z.object({
  churchName: z.string().trim().min(1).max(200),
});

// Lets an existing seeker start their own channel without creating a second
// account — mirrors password pastor signup (app/api/auth/signup/route.js)
// minus the fields already removed from that form. 2FA is mandatory for
// every pastor account, so this immediately downgrades the caller's session
// to a 2FA-pending partial one, same as every other pastor session-issuance
// point (password signup, OAuth, sign-in — see lib/twoFactor.js), unless
// 2FA enforcement is currently paused.
export async function POST(req) {
  const { user, error } = await requireUser('seeker');
  if (error) return error;

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
  }

  const existingChurch = await prisma.church.findFirst({ where: { ownerId: user.sub } });
  if (existingChurch) {
    return NextResponse.json({ error: 'This account already owns a church' }, { status: 400 });
  }

  const seeker = await prisma.user.findUnique({ where: { id: user.sub } });
  const slug = await uniqueChurchSlug(slugify(input.churchName));
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.sub }, data: { role: 'pastor' } }),
    prisma.church.create({
      data: {
        ownerId: user.sub,
        name: input.churchName,
        slug,
        plan: 'starter',
        subscriptionStatus: 'trialing',
        trialEndsAt,
        city: seeker.city,
        state: seeker.state,
        country: seeker.country,
      },
    }),
  ]);

  if (isTwoFactorEnforced()) {
    const partialToken = signPartialSession({ sub: user.sub, role: 'pastor', email: user.email });
    const response = NextResponse.json({ twoFactorRequired: true, setupRequired: true });
    return setSessionCookie(response, partialToken, 60 * 10);
  }

  const token = signSession({ sub: user.sub, role: 'pastor', email: user.email });
  const response = NextResponse.json({ id: user.sub, role: 'pastor', email: user.email });
  return setSessionCookie(response, token);
}
