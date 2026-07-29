import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, signSession, setSessionCookie } from '@/lib/auth';
import { verifyTotp, verifySmsCode, generateBackupCodes, hashBackupCodes } from '@/lib/twoFactor';
import { rateLimit } from '@/lib/rateLimit';

const schema = z.object({ code: z.string().min(4).max(10) });

// Finishes enrollment: proves the pastor/seeker can produce a valid code for
// whichever method /api/auth/2fa/setup just started (a TOTP secret, or a
// texted SMS code — inferred from which one is actually pending on the
// account, since only one setup is ever in progress at a time), flips
// totpEnabled on and records the method, then — since this is usually
// reached from a 2FA-pending partial session during mandatory pastor setup —
// upgrades straight to a full session so they land on their dashboard
// without signing in again.
export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limited = rateLimit(req, '2fa-confirm', { max: 10, windowMs: 60_000 });
  if (limited) return limited;

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.sub },
    select: { totpSecret: true, smsCodeHash: true, smsCodeExpiresAt: true },
  });

  let method;
  let valid = false;
  if (dbUser?.smsCodeHash) {
    method = 'sms';
    valid = await verifySmsCode(input.code, dbUser.smsCodeHash, dbUser.smsCodeExpiresAt);
  } else if (dbUser?.totpSecret) {
    method = 'totp';
    valid = verifyTotp(input.code, dbUser.totpSecret);
  } else {
    return NextResponse.json({ error: 'Start setup first.' }, { status: 400 });
  }

  if (!valid) {
    return NextResponse.json({ error: 'Incorrect code. Please try again.' }, { status: 400 });
  }

  const backupCodes = generateBackupCodes();
  const hashedBackupCodes = await hashBackupCodes(backupCodes);

  await prisma.user.update({
    where: { id: user.sub },
    data: {
      totpEnabled: true,
      twoFactorMethod: method,
      totpBackupCodes: hashedBackupCodes,
      smsCodeHash: null,
      smsCodeExpiresAt: null,
      lastLoginAt: new Date(),
    },
  });

  const token = signSession({ sub: user.sub, role: user.role, email: user.email });
  const response = NextResponse.json({ success: true, method, backupCodes });
  return setSessionCookie(response, token);
}
