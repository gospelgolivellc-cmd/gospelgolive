import jwt from 'jsonwebtoken';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

// One-click unsubscribe for behavior-triggered lifecycle emails only — never
// used on transactional mail (receipts, password resets, 2FA, etc). No
// expiry: an old unsubscribe link in someone's inbox should keep working
// indefinitely, same as most ESPs' list-unsubscribe links.
export function unsubscribeUrl(userId) {
  const token = jwt.sign({ sub: userId, purpose: 'marketing_unsubscribe' }, process.env.AUTH_SECRET);
  return `${APP_URL}/api/email-preferences/unsubscribe?token=${token}`;
}

export function verifyUnsubscribeToken(token) {
  try {
    const payload = jwt.verify(token, process.env.AUTH_SECRET);
    return payload.purpose === 'marketing_unsubscribe' ? payload.sub : null;
  } catch {
    return null;
  }
}
