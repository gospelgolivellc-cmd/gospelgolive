import jwt from 'jsonwebtoken';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyTotp, verifySmsCode, findMatchingBackupCode, isTwoFactorEnforced } from '@/lib/twoFactor';

const TRUST_COOKIE_NAME = 'gather_give_trust';
const TRUST_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days — "remember this device" for giving 2FA

function hasTrustedDevice(req, userId) {
  const token = req.cookies.get(TRUST_COOKIE_NAME)?.value;
  if (!token) return false;
  try {
    const payload = jwt.verify(token, process.env.AUTH_SECRET);
    return payload.sub === userId;
  } catch {
    return false;
  }
}

export function setGivingTrustCookie(response, userId) {
  const token = jwt.sign({ sub: userId }, process.env.AUTH_SECRET, { expiresIn: TRUST_MAX_AGE_SECONDS });
  response.cookies.set(TRUST_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TRUST_MAX_AGE_SECONDS,
  });
  return response;
}

// The one exception to mandatory giving 2FA: a real, currently-live stream
// belonging to this same church — spontaneous in-service giving shouldn't
// be blocked on a code. Requires an actual live Stream row (not just a
// client-asserted flag), so it can't be forged into a blanket 2FA bypass.
async function isLiveGivingContext(streamId, churchId) {
  if (!streamId) return false;
  const stream = await prisma.stream.findUnique({ where: { id: streamId }, select: { churchId: true, status: true } });
  return Boolean(stream && stream.churchId === churchId && stream.status === 'live');
}

// Gate called from both app/api/donations/intent and .../subscription,
// right after the existing sign-in/follow checks and before any Stripe
// object is created. Returns { ok: true, setTrust? } to proceed, or
// { ok: false, response } to return immediately.
export async function enforceGivingTwoFactor({ req, giverId, churchId, streamId, code }) {
  if (!isTwoFactorEnforced()) {
    return { ok: true };
  }

  if (await isLiveGivingContext(streamId, churchId)) {
    return { ok: true };
  }

  const giver = await prisma.user.findUnique({
    where: { id: giverId },
    select: {
      totpEnabled: true,
      totpSecret: true,
      totpBackupCodes: true,
      twoFactorMethod: true,
      smsCodeHash: true,
      smsCodeExpiresAt: true,
    },
  });

  if (!giver.totpEnabled) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Two-factor authentication is required before giving. Set it up to continue.',
          code: 'TWO_FACTOR_SETUP_REQUIRED',
        },
        { status: 403 }
      ),
    };
  }

  if (hasTrustedDevice(req, giverId)) {
    return { ok: true };
  }

  if (!code) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Enter your two-factor code to continue.',
          code: 'TWO_FACTOR_CODE_REQUIRED',
          method: giver.twoFactorMethod,
        },
        { status: 403 }
      ),
    };
  }

  const validPrimary =
    giver.twoFactorMethod === 'sms'
      ? await verifySmsCode(code, giver.smsCodeHash, giver.smsCodeExpiresAt)
      : verifyTotp(code, giver.totpSecret);
  let matchedBackupIndex = -1;
  if (!validPrimary) {
    matchedBackupIndex = await findMatchingBackupCode(code, giver.totpBackupCodes);
  }

  if (!validPrimary && matchedBackupIndex === -1) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Incorrect code. Please try again.' }, { status: 401 }),
    };
  }

  const updateData = {};
  if (matchedBackupIndex !== -1) {
    const remaining = [...giver.totpBackupCodes];
    remaining.splice(matchedBackupIndex, 1);
    updateData.totpBackupCodes = remaining;
  } else if (giver.twoFactorMethod === 'sms') {
    updateData.smsCodeHash = null;
    updateData.smsCodeExpiresAt = null;
  }
  if (Object.keys(updateData).length > 0) {
    await prisma.user.update({ where: { id: giverId }, data: updateData });
  }

  return { ok: true, setTrust: true };
}
