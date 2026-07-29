import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  PROVIDERS,
  readOAuthState,
  clearOAuthStateCookie,
  exchangeCodeForToken,
  fetchOAuthProfile,
  findLinkedUser,
  createSeekerFromOAuth,
} from '@/lib/oauth';
import { signSession, signPartialSession, setSessionCookie } from '@/lib/auth';
import { rateLimit } from '@/lib/rateLimit';
import { prisma } from '@/lib/prisma';
import { recordTermsAcceptance } from '@/lib/terms';
import { isTwoFactorEnforced } from '@/lib/twoFactor';

function errorRedirect(req, reason) {
  return NextResponse.redirect(new URL(`/mockup.html?oauth=error&reason=${reason}`, req.url));
}

export async function GET(req, { params }) {
  const limited = rateLimit(req, 'oauth-callback', { max: 20, windowMs: 60_000 });
  if (limited) return limited;

  const { provider } = await params;
  if (!PROVIDERS[provider]) {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 404 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  // The provider sends `error` back instead of `code` when the visitor
  // declines the consent screen — that's a normal outcome, not a bug.
  if (url.searchParams.get('error') || !code) {
    return clearOAuthStateCookie(errorRedirect(req, 'denied'));
  }

  const cookieStore = await cookies();
  const state = readOAuthState(cookieStore);
  if (!state || state.provider !== provider || state.state !== returnedState) {
    return clearOAuthStateCookie(errorRedirect(req, 'invalid_state'));
  }

  let profile;
  try {
    const tokens = await exchangeCodeForToken(provider, code, state.codeVerifier);
    profile = await fetchOAuthProfile(provider, tokens.access_token);
  } catch (err) {
    console.error(`${provider} OAuth exchange failed`, err);
    return clearOAuthStateCookie(errorRedirect(req, 'exchange_failed'));
  }

  const identity = { provider, providerId: profile.providerId, email: profile.email, fullName: profile.fullName };

  try {
    let user = await findLinkedUser(identity);

    // Only a brand-new seeker identity is a genuine acceptance event — an
    // existing account linking/using this identity already accepted at its
    // own original signup, and shouldn't have a fresh row recorded on every
    // sign-in. The seeker "Continue with Google/Twitter" buttons on both the
    // sign-in and sign-up tabs carry the same visible Terms/Privacy
    // disclaimer right above them (see public/mockup.html), so continuing
    // past that disclaimer is the acceptance action for this path — there's
    // no separate profile-completion form for seekers to gate on instead.
    let isNewSeeker = false;
    if (!user && state.role === 'seeker') {
      user = await createSeekerFromOAuth(identity);
      isNewSeeker = true;
    }

    if (isNewSeeker) {
      await recordTermsAcceptance(prisma, user.id, req);
    }

    if (!user) {
      // Only seekers can be created fresh via OAuth — a brand-new pastor
      // identity (state.role === 'pastor') is rejected outright rather than
      // parked, since pastor accounts must go through the sign up form to
      // collect the required church details up front.
      return clearOAuthStateCookie(errorRedirect(req, 'pastor_oauth_disabled'));
    }

    if (user.deactivatedAt) {
      return clearOAuthStateCookie(errorRedirect(req, 'deactivated'));
    }

    // 2FA is mandatory for every pastor account regardless of sign-in
    // method — an existing pastor linking/using Google or Twitter still only
    // gets a 2FA-pending partial session here, same as a password sign-in.
    if (user.role === 'pastor' && isTwoFactorEnforced()) {
      const partialToken = signPartialSession({ sub: user.id, role: user.role, email: user.email });
      const setupParam = user.totpEnabled ? 'verify' : 'setup';
      const methodParam = user.twoFactorMethod ? `&method=${user.twoFactorMethod}` : '';
      const response = NextResponse.redirect(new URL(`/mockup.html?oauth=2fa&twofa=${setupParam}${methodParam}`, req.url));
      clearOAuthStateCookie(response);
      return setSessionCookie(response, partialToken, 60 * 10);
    }

    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch((err) =>
      console.error('Failed to record lastLoginAt', err)
    );

    const token = signSession({ sub: user.id, role: user.role, email: user.email });
    const response = NextResponse.redirect(new URL('/mockup.html?oauth=success', req.url));
    clearOAuthStateCookie(response);
    return setSessionCookie(response, token);
  } catch (err) {
    console.error(`${provider} OAuth sign-in failed`, err);
    return clearOAuthStateCookie(errorRedirect(req, 'server_error'));
  }
}
