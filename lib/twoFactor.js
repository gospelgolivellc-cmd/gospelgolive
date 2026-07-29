import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// Temporary kill switch — lets 2FA be paused (e.g. while sorting out Twilio)
// without ripping out any of the gating logic. Defaults to enforced; set
// TWO_FACTOR_ENFORCED=false in .env.local/Vercel to pause it, then remove
// the env var (or set back to true) to re-enable with no code changes.
export function isTwoFactorEnforced() {
  return process.env.TWO_FACTOR_ENFORCED !== 'false';
}

// Allows the code either side of the current 30-second step, so a slightly
// out-of-sync phone clock doesn't lock a pastor/giver out.
authenticator.options = { window: 1 };

const ISSUER = 'GospelGoLive';

export function generateTotpSecret() {
  return authenticator.generateSecret();
}

export function totpKeyUri(secret, email) {
  return authenticator.keyuri(email, ISSUER, secret);
}

export async function totpQrCodeDataUrl(secret, email) {
  return QRCode.toDataURL(totpKeyUri(secret, email));
}

export function verifyTotp(code, secret) {
  if (!code || !secret) return false;
  try {
    return authenticator.check(String(code).trim(), secret);
  } catch {
    return false;
  }
}

// SMS-method alternative to a TOTP code — a short numeric code texted to the
// enrolled phone number (lib/sms.js), valid for SMS_CODE_TTL_MINUTES and
// hashed the same way as backup codes before it's stored.
export const SMS_CODE_TTL_MINUTES = 10;

export function generateSmsCode() {
  return String(crypto.randomInt(100000, 1000000));
}

export async function hashSmsCode(code) {
  return bcrypt.hash(code, 10);
}

export async function verifySmsCode(code, hash, expiresAt) {
  if (!code || !hash || !expiresAt) return false;
  if (new Date(expiresAt).getTime() < Date.now()) return false;
  return bcrypt.compare(String(code).trim(), hash);
}

// Shown once, right after enabling 2FA, so the account isn't permanently
// locked out if the authenticator app/device is ever lost. Stored hashed
// (same bcrypt pattern as passwords) — never persisted or logged in plain.
export function generateBackupCodes(count = 8) {
  return Array.from({ length: count }, () => crypto.randomBytes(5).toString('hex'));
}

export async function hashBackupCodes(codes) {
  return Promise.all(codes.map((code) => bcrypt.hash(code, 10)));
}

// Returns the index of the first matching hashed code, or -1 if none match
// — caller is responsible for removing the matched entry so each backup
// code only works once.
export async function findMatchingBackupCode(code, hashedCodes) {
  for (let i = 0; i < hashedCodes.length; i++) {
    if (await bcrypt.compare(code, hashedCodes[i])) return i;
  }
  return -1;
}
