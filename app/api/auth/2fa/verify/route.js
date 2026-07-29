import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, signSession, setSessionCookie } from '@/lib/auth';
import { verifyTotp, verifySmsCode, findMatchingBackupCode } from '@/lib/twoFactor';
import { rateLimit } from '@/lib/rateLimit';

const schema = z.object({ code: z.string().min(4).max(10) });

// Upgrades a 2FA-pending partial session (issued at sign-in for a pastor who
// already has 2FA enabled) to a full session, once the submitted code checks
// out. For the 'totp' method that's against their authenticator secret; for
// 'sms' it's against the code /api/auth/2fa/sms/send just texted them (which
// the client is expected to have called first). Either method also accepts
// a single-use backup code as a fallback.
export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limited = rateLimit(req, '2fa-verify', { max: 10, windowMs: 60_000 });
  if (limited) return limited;

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.sub },
    select: {
      totpSecret: true,
      totpEnabled: true,
      totpBackupCodes: true,
      twoFactorMethod: true,
      smsCodeHash: true,
      smsCodeExpiresAt: true,
      role: true,
      email: true,
      fullName: true,
    },
  });
  if (!dbUser?.totpEnabled) {
    return NextResponse.json({ error: 'Two-factor authentication is not enabled on this account.' }, { status: 400 });
  }

  const validPrimary =
    dbUser.twoFactorMethod === 'sms'
      ? await verifySmsCode(input.code, dbUser.smsCodeHash, dbUser.smsCodeExpiresAt)
      : verifyTotp(input.code, dbUser.totpSecret);

  let matchedBackupIndex = -1;
  if (!validPrimary) {
    matchedBackupIndex = await findMatchingBackupCode(input.code, dbUser.totpBackupCodes);
  }

  if (!validPrimary && matchedBackupIndex === -1) {
    return NextResponse.json({ error: 'Incorrect code. Please try again.' }, { status: 401 });
  }

  const updateData = { lastLoginAt: new Date() };
  if (matchedBackupIndex !== -1) {
    const remaining = [...dbUser.totpBackupCodes];
    remaining.splice(matchedBackupIndex, 1);
    updateData.totpBackupCodes = remaining;
  } else if (dbUser.twoFactorMethod === 'sms') {
    updateData.smsCodeHash = null;
    updateData.smsCodeExpiresAt = null;
  }
  await prisma.user.update({ where: { id: user.sub }, data: updateData });

  const token = signSession({ sub: user.sub, role: dbUser.role, email: dbUser.email });
  const response = NextResponse.json({
    success: true,
    role: dbUser.role,
    email: dbUser.email,
    fullName: dbUser.fullName,
    usedBackupCode: matchedBackupIndex !== -1,
  });
  return setSessionCookie(response, token);
}
