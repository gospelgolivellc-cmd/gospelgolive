import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import {
  generateTotpSecret,
  totpKeyUri,
  totpQrCodeDataUrl,
  generateSmsCode,
  hashSmsCode,
  SMS_CODE_TTL_MINUTES,
} from '@/lib/twoFactor';
import { sendSmsCode } from '@/lib/sms';
import { rateLimit } from '@/lib/rateLimit';

const schema = z.object({
  method: z.enum(['totp', 'sms']).optional().default('totp'),
  phoneNumber: z.string().min(7).max(20).optional(),
});

// Starts (or restarts) 2FA enrollment. Reads the session directly via
// getCurrentUser() rather than requireUser() — a pastor mid-mandatory-setup
// only has a 2FA-pending partial session at this point, which requireUser()
// would otherwise reject everywhere else in the app. For the 'totp' method
// the secret is stored immediately but totpEnabled stays false until
// /api/auth/2fa/confirm proves the pastor/seeker can generate a valid code
// with it. For the 'sms' method a fresh texted code plays the same "unconfirmed
// until proven" role — it's stored hashed with an expiry, and confirming it
// is what actually flips totpEnabled on.
export async function POST(req) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limited = rateLimit(req, '2fa-setup', { max: 10, windowMs: 60_000 });
  if (limited) return limited;

  let input;
  try {
    input = schema.parse(await req.json().catch(() => ({})));
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
  }

  if (input.method === 'sms') {
    if (!input.phoneNumber) {
      return NextResponse.json({ error: 'Enter a phone number.' }, { status: 400 });
    }
    const code = generateSmsCode();
    const smsCodeHash = await hashSmsCode(code);
    const smsCodeExpiresAt = new Date(Date.now() + SMS_CODE_TTL_MINUTES * 60_000);

    await prisma.user.update({
      where: { id: user.sub },
      data: {
        phoneNumber: input.phoneNumber,
        smsCodeHash,
        smsCodeExpiresAt,
        totpEnabled: false,
      },
    });

    const result = await sendSmsCode(input.phoneNumber, code);
    return NextResponse.json({
      method: 'sms',
      phoneNumber: input.phoneNumber,
      devCode: result.stub ? code : undefined,
    });
  }

  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id: user.sub }, data: { totpSecret: secret, totpEnabled: false } });

  const qrCodeDataUrl = await totpQrCodeDataUrl(secret, user.email);

  return NextResponse.json({
    method: 'totp',
    secret,
    otpauthUrl: totpKeyUri(secret, user.email),
    qrCodeDataUrl,
  });
}
