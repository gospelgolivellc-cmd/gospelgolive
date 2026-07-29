import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyUnsubscribeToken } from '@/lib/emailPreferences';

// Same branded confirmation-page shell as verify-email/confirm's page().
function page(title, message, ok) {
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
  p{color:#a6b0cc; font-size:14px; margin:0;}
</style>
</head>
<body>
  <div class="card">
    <div class="icon">${ok ? '✓' : '✕'}</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
}

// Unsubscribes from behavior-triggered lifecycle emails only — never touches
// transactional mail, which has no opt-out. Idempotent: revisiting the same
// link (or a token for an already-unsubscribed account) just re-confirms.
export async function GET(req) {
  const token = new URL(req.url).searchParams.get('token');
  const userId = token && verifyUnsubscribeToken(token);

  if (!userId) {
    return page('Invalid link', "This unsubscribe link is invalid. If you're trying to stop these emails, sign in and update your notification preferences instead.", false);
  }

  await prisma.user.updateMany({ where: { id: userId }, data: { marketingOptOut: true } });

  return page('Unsubscribed', "You won't receive these emails anymore. Transactional emails (receipts, security alerts, etc.) are unaffected.", true);
}
