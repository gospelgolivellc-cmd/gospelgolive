import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { generateSmsCode, hashSmsCode, SMS_CODE_TTL_MINUTES } from '@/lib/twoFactor';
import { sendSmsCode } from '@/lib/sms';
import { rateLimit } from '@/lib/rateLimit';

function maskPhoneNumber(phoneNumber) {
  if (!phoneNumber || phoneNumber.length < 4) return phoneNumber;
  return `••••${phoneNumber.slice(-4)}`;
}

// (Re)sends a fresh SMS code to an already-enrolled sms-method account —
// used both when a pastor with sms 2FA reaches the sign-in verify step, and
// when a giver with sms 2FA is prompted for a code before a gift goes
// through. Reads the session directly via getCurrentUser() (not
// requireUser()) since a 2FA-pending partial session needs to be able to
// call this too, same reasoning as /api/auth/2fa/setup.
export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limited = rateLimit(req, '2fa-sms-send', { max: 5, windowMs: 60_000 });
  if (limited) return limited;

  const dbUser = await prisma.user.findUnique({
    where: { id: user.sub },
    select: { totpEnabled: true, twoFactorMethod: true, phoneNumber: true },
  });

  if (!dbUser?.totpEnabled || dbUser.twoFactorMethod !== 'sms' || !dbUser.phoneNumber) {
    return NextResponse.json({ error: 'Phone-based two-factor authentication is not set up on this account.' }, { status: 400 });
  }

  const code = generateSmsCode();
  const smsCodeHash = await hashSmsCode(code);
  const smsCodeExpiresAt = new Date(Date.now() + SMS_CODE_TTL_MINUTES * 60_000);

  await prisma.user.update({ where: { id: user.sub }, data: { smsCodeHash, smsCodeExpiresAt } });

  const result = await sendSmsCode(dbUser.phoneNumber, code);
  return NextResponse.json({
    sent: true,
    maskedPhoneNumber: maskPhoneNumber(dbUser.phoneNumber),
    devCode: result.stub ? code : undefined,
  });
}
