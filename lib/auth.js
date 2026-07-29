import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const COOKIE_NAME = 'gather_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
// Short-lived — just long enough for a pastor to reach for their
// authenticator app after password/OAuth sign-in. A pending session that
// expires before 2FA is completed just means signing in again from scratch;
// nothing sensitive was ever exposed under it (requireUser rejects it).
const PARTIAL_SESSION_MAX_AGE_SECONDS = 60 * 10; // 10 minutes

// JWT payload shape: { sub: userId, role: 'pastor' | 'seeker' | 'admin', email }
// Partial (2FA-pending) sessions add `twoFactorPending: true` and carry the
// same fields otherwise — requireUser() below treats them as unauthenticated
// everywhere except the /api/auth/2fa/* routes, which read the pending
// session directly via getCurrentUser().

export function signSession(payload, maxAgeSeconds = SESSION_MAX_AGE_SECONDS) {
  return jwt.sign(payload, process.env.AUTH_SECRET, { expiresIn: maxAgeSeconds });
}

// A pastor sign-in (password or OAuth, any method) that hasn't yet cleared
// 2FA gets this instead of a full session — proves the password/OAuth step
// succeeded without granting access to anything else until the code is
// verified via POST /api/auth/2fa/verify (see that route for the upgrade to
// a full session).
export function signPartialSession(payload) {
  return signSession({ ...payload, twoFactorPending: true }, PARTIAL_SESSION_MAX_AGE_SECONDS);
}

export function setSessionCookie(response, token, maxAgeSeconds = SESSION_MAX_AGE_SECONDS) {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  });
  return response;
}

export function setPartialSessionCookie(response, token) {
  return setSessionCookie(response, token, PARTIAL_SESSION_MAX_AGE_SECONDS);
}

export function clearSessionCookie(response) {
  response.cookies.set(COOKIE_NAME, '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    return jwt.verify(token, process.env.AUTH_SECRET);
  } catch {
    return null;
  }
}

export async function requireUser(role) {
  const user = await getCurrentUser();
  // A 2FA-pending session isn't a real session for any normal route — only
  // the 2FA setup/verify routes read it (directly via getCurrentUser, not
  // this helper), so a pastor who hasn't cleared 2FA yet is indistinguishable
  // from being signed out everywhere else in the app.
  if (!user || user.twoFactorPending) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (role && user.role !== role) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user };
}
