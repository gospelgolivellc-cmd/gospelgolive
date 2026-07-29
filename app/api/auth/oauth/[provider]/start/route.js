import { NextResponse } from 'next/server';
import { PROVIDERS, buildAuthorizeUrl, setOAuthStateCookie } from '@/lib/oauth';
import { rateLimit } from '@/lib/rateLimit';

// Kicks off "Continue with Google/Twitter" — a plain top-level GET redirect
// to the provider's own consent screen, not a fetch(); the browser must
// navigate there directly for the provider's cookies/session to apply.
export async function GET(req, { params }) {
  const limited = rateLimit(req, 'oauth-start', { max: 20, windowMs: 60_000 });
  if (limited) return limited;

  const { provider } = await params;
  if (!PROVIDERS[provider]) {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 404 });
  }

  const config = PROVIDERS[provider];
  if (!config.clientId() || !config.clientSecret()) {
    return NextResponse.json({ error: `${provider} sign-in isn't configured yet` }, { status: 503 });
  }

  const role = new URL(req.url).searchParams.get('role') === 'pastor' ? 'pastor' : 'seeker';
  const { url, stateToken } = buildAuthorizeUrl(provider, role);

  return setOAuthStateCookie(NextResponse.redirect(url), stateToken);
}
