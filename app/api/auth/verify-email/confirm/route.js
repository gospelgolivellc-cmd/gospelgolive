import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signSession, signPartialSession, setSessionCookie } from '@/lib/auth';
import { sendPastorWelcomeEmail, sendSeekerWelcomeEmail, escapeHtml } from '@/lib/email';
import { isTwoFactorEnforced } from '@/lib/twoFactor';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

// A handful of popular churches to tease in the seeker welcome email — a
// lighter version of /api/churches/recommended's full location-tiered
// ranking (not worth duplicating that logic for a one-time welcome email).
async function topChurchesHtml() {
  const churches = await prisma.church.findMany({
    where: { owner: { deactivatedAt: null } },
    orderBy: { follows: { _count: 'desc' } },
    take: 3,
    select: { name: true, slug: true, _count: { select: { follows: true } } },
  });
  if (churches.length === 0) return '<p>Browse churches to get started.</p>';
  return `<ul>${churches
    .map((c) => `<li><a href="${APP_URL}/church.html?slug=${c.slug}" style="color:#f5d787;">${escapeHtml(c.name)}</a></li>`)
    .join('')}</ul>`;
}

function page(title, message, ok, linkHref = '/mockup.html', linkText = 'Back to GospelGoLive') {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title} — GospelGoLive</title>
<style>
  body{background:#0a1530; color:#eef1f8; font-family:'Inter',sans-serif; min-height:100vh; margin:0; display:flex; align-items:center; justify-content:center; text-align:center; padding:24px;}
  .card{background:#122548; border:1px solid rgba(255,255,255,0.08); border-radius:20px; padding:42px 38px; max-width:420px;}
  .icon{width:56px; height:56px; border-radius:50%; margin:0 auto 20px; display:flex; align-items:center; justify-content:center; font-size:26px; background:${ok ? 'rgba(232,184,75,0.14)' : 'rgba(224,90,90,0.14)'}; color:${ok ? '#f5d787' : '#e05a5a'};}
  h1{font-size:22px; margin:0 0 10px;}
  p{color:#a6b0cc; font-size:14px; margin:0 0 22px;}
  a{display:inline-block; background:linear-gradient(180deg,#f5d787,#e8b84b); color:#20160a; text-decoration:none; font-weight:600; padding:11px 24px; border-radius:999px; font-size:14px;}
</style>
</head>
<body>
  <div class="card">
    <div class="icon">${ok ? '✓' : '✕'}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="${linkHref}">${linkText}</a>
  </div>
</body>
</html>`;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
}

export async function GET(req) {
  const token = new URL(req.url).searchParams.get('token');

  if (!token) {
    return page('Invalid link', 'This verification link is missing its token.', false);
  }

  const record = await prisma.verificationToken.findUnique({ where: { token } });

  if (!record || record.purpose !== 'email_verify' || record.usedAt) {
    return page('Invalid link', 'This verification link has already been used or is invalid.', false);
  }
  if (record.expiresAt < new Date()) {
    return page('Link expired', 'This verification link has expired. Sign in and request a new one.', false);
  }

  const [user] = await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { emailVerified: true } }),
    prisma.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);

  // Fire-and-forget — the welcome email shouldn't block getting the visitor
  // to their dashboard, and a delivery failure here isn't worth failing the
  // whole verification over.
  if (user.role === 'pastor') {
    sendPastorWelcomeEmail(user.email, { fullName: user.fullName }).catch((e) =>
      console.error('Failed to send pastor welcome email', e)
    );
  } else if (user.role === 'seeker') {
    topChurchesHtml()
      .then((recommendedChurchesHtml) =>
        sendSeekerWelcomeEmail(user.email, { fullName: user.fullName, recommendedChurchesHtml })
      )
      .catch((e) => console.error('Failed to send seeker welcome email', e));
  }

  // Verifying activates the account — sign them straight in so clicking the
  // link takes them right to their dashboard instead of back to a sign-in
  // form. Pastors are the one exception: 2FA is mandatory, so this only ever
  // grants a partial session that routes into mandatory setup instead of the
  // real dashboard.
  if (user.role === 'pastor' && isTwoFactorEnforced()) {
    const partialToken = signPartialSession({ sub: user.id, role: user.role, email: user.email });
    const response = page(
      'Email verified',
      'One more step — set up two-factor authentication to secure your account.',
      true,
      '/mockup.html?verified=pastor&twofa=setup',
      'Set Up Two-Factor Auth'
    );
    return setSessionCookie(response, partialToken, 60 * 10);
  }

  // Seekers land here with a full session immediately (unlike pastors,
  // exempted above) — this is the moment they actually become "logged in".
  prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch((err) =>
    console.error('Failed to record lastLoginAt', err)
  );

  const sessionToken = signSession({ sub: user.id, role: user.role, email: user.email });
  const response = page(
    'Email verified',
    "Your account is now active. Let's get you to your dashboard.",
    true,
    `/mockup.html?verified=${user.role}`,
    'Continue to Dashboard'
  );
  return setSessionCookie(response, sessionToken);
}
