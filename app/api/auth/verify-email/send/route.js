import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { issueVerificationEmail } from '@/lib/verification';
import { rateLimit } from '@/lib/rateLimit';

// Works both signed in (dashboard "resend" button) and signed out (the
// account isn't usable until verified, so there'd otherwise be no way to
// request a fresh link if the first email never arrived).
export async function POST(req) {
  const limited = rateLimit(req, 'verify-email-send', { max: 5, windowMs: 60_000 });
  if (limited) return limited;

  const user = await getCurrentUser();
  let targetUser;

  if (user) {
    targetUser = await prisma.user.findUnique({ where: { id: user.sub } });
  } else {
    let body = {};
    try {
      body = await req.json();
    } catch {
      // no body — handled by the missing-email check below
    }
    if (!body.email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }
    targetUser = await prisma.user.findUnique({ where: { email: body.email } });
  }

  if (!targetUser) {
    // Don't leak whether an email is registered when unauthenticated.
    return NextResponse.json({ ok: true });
  }
  if (targetUser.emailVerified) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  try {
    await issueVerificationEmail(targetUser);
  } catch (err) {
    console.error('Failed to send verification email', err);
    return NextResponse.json({ error: 'Failed to send verification email' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
