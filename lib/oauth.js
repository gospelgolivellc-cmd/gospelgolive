import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

const STATE_COOKIE = 'gather_oauth_state';
// Just long enough to clear the provider's consent screen — these cookies
// only carry the flow through a single redirect round-trip.
const STATE_MAX_AGE_SECONDS = 60 * 10;

export const PROVIDERS = {
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    scope: 'openid email profile',
    usesPkce: false,
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
  },
  twitter: {
    authorizeUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    userInfoUrl: 'https://api.twitter.com/2/users/me?user.fields=name,username',
    scope: 'tweet.read users.read offline.access',
    usesPkce: true, // X's OAuth 2.0 user-context flow requires PKCE
    clientId: () => process.env.TWITTER_CLIENT_ID,
    clientSecret: () => process.env.TWITTER_CLIENT_SECRET,
  },
};

function redirectUriFor(provider) {
  return `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/oauth/${provider}/callback`;
}

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// `role` is the signup role the visitor picked before starting the redirect
// ('pastor' | 'seeker'), carried through the signed state cookie so the
// callback route knows what to do if this turns out to be a brand-new identity.
export function buildAuthorizeUrl(provider, role) {
  const config = PROVIDERS[provider];
  const state = crypto.randomBytes(16).toString('hex');
  const codeVerifier = config.usesPkce ? base64url(crypto.randomBytes(32)) : null;

  const params = new URLSearchParams({
    client_id: config.clientId(),
    redirect_uri: redirectUriFor(provider),
    response_type: 'code',
    scope: config.scope,
    state,
  });
  if (provider === 'google') {
    params.set('access_type', 'online');
    params.set('prompt', 'select_account');
  }
  if (codeVerifier) {
    const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 'S256');
  }

  const stateToken = jwt.sign({ provider, role, state, codeVerifier }, process.env.AUTH_SECRET, {
    expiresIn: STATE_MAX_AGE_SECONDS,
  });

  return { url: `${config.authorizeUrl}?${params.toString()}`, stateToken };
}

export function setOAuthStateCookie(response, stateToken) {
  response.cookies.set(STATE_COOKIE, stateToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // must still be sent on the top-level GET redirect back from the provider
    path: '/',
    maxAge: STATE_MAX_AGE_SECONDS,
  });
  return response;
}

export function clearOAuthStateCookie(response) {
  response.cookies.set(STATE_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
}

export function readOAuthState(cookieStore) {
  const token = cookieStore.get(STATE_COOKIE)?.value;
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.AUTH_SECRET);
  } catch {
    return null;
  }
}

export async function exchangeCodeForToken(provider, code, codeVerifier) {
  const config = PROVIDERS[provider];
  const body = new URLSearchParams({
    client_id: config.clientId(),
    code,
    redirect_uri: redirectUriFor(provider),
    grant_type: 'authorization_code',
  });
  if (codeVerifier) body.set('code_verifier', codeVerifier);

  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  // X's token endpoint expects the client secret via HTTP Basic auth for
  // confidential clients rather than in the body; Google accepts it in the body.
  if (provider === 'twitter') {
    headers.Authorization =
      'Basic ' + Buffer.from(`${config.clientId()}:${config.clientSecret()}`).toString('base64');
  } else {
    body.set('client_secret', config.clientSecret());
  }

  const res = await fetch(config.tokenUrl, { method: 'POST', headers, body });
  if (!res.ok) throw new Error(`${provider} token exchange failed: ${await res.text()}`);
  return res.json();
}

export async function fetchOAuthProfile(provider, accessToken) {
  const config = PROVIDERS[provider];
  const res = await fetch(config.userInfoUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`${provider} profile fetch failed: ${await res.text()}`);
  const data = await res.json();

  if (provider === 'google') {
    return { providerId: data.sub, email: data.email || null, fullName: data.name || data.email };
  }
  // X's OAuth 2.0 user-context API doesn't expose email addresses to most
  // developer apps — callers fall back to a placeholder when this is null.
  const profile = data.data;
  return { providerId: profile.id, email: null, fullName: profile.name || profile.username };
}

const idFieldFor = (provider) => (provider === 'google' ? 'googleId' : 'twitterId');

function placeholderEmail(provider, providerId) {
  return `${provider}_${providerId}@users.noreply.gospelgolive.local`;
}

// Looks up a user already linked to this provider identity, or — for Google
// only, since Google verifies the email itself — links a matching existing
// password account by email. Never creates a new user; the callback route
// decides how (and whether) to do that based on the requested role.
export async function findLinkedUser({ provider, providerId, email }) {
  const idField = idFieldFor(provider);
  let user = await prisma.user.findFirst({ where: { [idField]: providerId } });
  if (user) return user;

  if (provider === 'google' && email) {
    user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      // If nobody had verified this email yet, its existing passwordHash
      // carries no real claim — it could belong to anyone who signed up
      // first with this address, not necessarily the Google account holder
      // completing this flow. Google just verified the email itself, so
      // that's the stronger proof: clear the old password (forcing a reset
      // if they ever want one) rather than leaving it valid for whoever set
      // it. An already-verified account's password is a real claim and is
      // left untouched — this only fires for a dormant, unproven one.
      const data = { [idField]: providerId };
      if (!user.emailVerified) {
        data.emailVerified = true;
        data.passwordHash = null;
      }
      return prisma.user.update({ where: { id: user.id }, data });
    }
  }
  return null;
}

export async function createSeekerFromOAuth({ provider, providerId, email, fullName }) {
  const idField = idFieldFor(provider);
  return prisma.user.create({
    data: {
      email: email || placeholderEmail(provider, providerId),
      passwordHash: null,
      role: 'seeker',
      fullName: fullName || 'New Member',
      // A completed OAuth handshake is itself proof of a live, controlled
      // identity — treated the same as a verified email for gating purposes.
      emailVerified: true,
      [idField]: providerId,
    },
  });
}
