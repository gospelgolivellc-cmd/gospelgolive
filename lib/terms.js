import { extractClientIp } from '@/lib/geo';

// Bump this whenever the Terms of Service or Privacy Policy content changes
// materially. Existing TermsAcceptance rows keep whatever version string was
// current when they were recorded, so this only affects new acceptances —
// there's no forced re-acceptance flow for existing accounts yet.
export const TERMS_VERSION = '2026-07-26-draft-v1';

// Called right after a new account is actually created, from every signup
// path (password, OAuth seeker auto-create, OAuth pastor completion). Never
// updates or reuses a row — one INSERT per acceptance, so the history stays
// intact even if the terms change later.
export async function recordTermsAcceptance(prisma, userId, req) {
  await prisma.termsAcceptance.create({
    data: {
      userId,
      version: TERMS_VERSION,
      ipAddress: extractClientIp(req),
    },
  });
}
