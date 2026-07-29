import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { signSession, signPartialSession, setSessionCookie } from '@/lib/auth';
import { rateLimit } from '@/lib/rateLimit';
import { isTwoFactorEnforced } from '@/lib/twoFactor';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Bcrypt hash of a random string — compared against when no user is found,
// so a lookup miss takes the same time as a wrong password and doesn't leak
// which emails are registered via response timing.
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8gGBUOZTNr/GO7ZWJZQq9uW6R6/UZS';

export async function POST(req) {
  const limited = rateLimit(req, 'signin', { max: 10, windowMs: 60_000 });
  if (limited) return limited;

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const valid = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !valid) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  if (user.deactivatedAt) {
    return NextResponse.json(
      { error: 'This account has been deactivated.', code: 'ACCOUNT_DEACTIVATED' },
      { status: 403 }
    );
  }

  if (!user.emailVerified) {
    return NextResponse.json(
      { error: 'Please verify your email before signing in.', code: 'EMAIL_NOT_VERIFIED' },
      { status: 403 }
    );
  }

  // Mandatory 2FA for every pastor account, regardless of whether it's
  // already enrolled — an unenrolled pastor gets routed into setup instead
  // of a free pass, so there's no way to keep signing in indefinitely
  // without ever completing it.
  if (user.role === 'pastor' && isTwoFactorEnforced()) {
    const partialToken = signPartialSession({ sub: user.id, role: user.role, email: user.email });
    const response = NextResponse.json({
      twoFactorRequired: true,
      setupRequired: !user.totpEnabled,
      method: user.twoFactorMethod,
    });
    return setSessionCookie(response, partialToken, 60 * 10);
  }

  prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch((err) =>
    console.error('Failed to record lastLoginAt', err)
  );

  const token = signSession({ sub: user.id, role: user.role, email: user.email });
  const response = NextResponse.json({
    id: user.id,
    role: user.role,
    email: user.email,
    fullName: user.fullName,
  });
  return setSessionCookie(response, token);
}
