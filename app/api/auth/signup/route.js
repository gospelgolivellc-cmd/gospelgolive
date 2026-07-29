import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { slugify, uniqueChurchSlug } from '@/lib/slug';
import { issueVerificationEmail } from '@/lib/verification';
import { rateLimit } from '@/lib/rateLimit';
import { extractClientIp, lookupIpLocation } from '@/lib/geo';
import { trackEvent } from '@/lib/posthogServer';
import { recordTermsAcceptance } from '@/lib/terms';

// z.literal(true) rather than z.boolean() — an unchecked box (false) or a
// missing field both fail validation the same way as any other malformed
// request, so an account can never be created without explicit acceptance,
// regardless of what the client sends.
const pastorSchema = z.object({
  role: z.literal('pastor'),
  fullName: z.string().min(1),
  churchName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  termsAccepted: z.literal(true),
});

const seekerSchema = z.object({
  role: z.literal('seeker'),
  fullName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  termsAccepted: z.literal(true),
});

const signupSchema = z.discriminatedUnion('role', [pastorSchema, seekerSchema]);

// Creates the account and, for pastors, the church they own — this is the
// row every Stripe route (`prisma.church.findFirst({ where: { ownerId } })`)
// has been assuming exists. Does NOT sign the visitor in — the account isn't
// usable until they click the verification link we email them, at which
// point /api/auth/verify-email/confirm signs them in.
export async function POST(req) {
  const limited = rateLimit(req, 'signup', { max: 10, windowMs: 60_000 });
  if (limited) return limited;

  let input;
  try {
    input = signupSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  try {
    let user;
    // No self-reported location at signup anymore (removed from the form) —
    // this always falls back to the automatic IP-based inference. A user can
    // still self-report/edit their city and state later from Settings.
    const location = lookupIpLocation(extractClientIp(req));

    // An email with an existing, never-verified account is *not* a taken
    // email — nobody has ever proven they control that inbox for it, so the
    // account row itself carries no real claim. Without this, whoever
    // signed up first (even an attacker who doesn't own the address) keeps
    // their password on file indefinitely: the real owner either bounces
    // off "already exists" here, or later verifies via the mailed link
    // (proof-of-inbox) or Google sign-in and unknowingly inherits an account
    // an attacker already knows the password to. Reclaiming — overwriting
    // the password/profile in place — means whoever completes signup last,
    // before anyone verifies, is the one the eventual verification actually
    // hands the account to. A verified account is a real claim and is never
    // touched here; that path still 409s exactly as before.
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    const reclaiming = existing && !existing.emailVerified && existing.role === input.role;

    if (input.role === 'pastor') {
      const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      if (reclaiming) {
        const existingChurch = await prisma.church.findFirst({ where: { ownerId: existing.id } });
        [user] = await prisma.$transaction([
          prisma.user.update({
            where: { id: existing.id },
            data: { passwordHash, fullName: input.fullName },
          }),
          ...(existingChurch
            ? [
                prisma.church.update({
                  where: { id: existingChurch.id },
                  data: {
                    name: input.churchName,
                    city: location.city,
                    state: location.state,
                    country: location.country,
                  },
                }),
              ]
            : []),
          // Any earlier verification link (e.g. one already sitting unread
          // in the real owner's inbox from someone else's attempt) must stop
          // working the moment the password it would unlock changes.
          prisma.verificationToken.deleteMany({
            where: { userId: existing.id, purpose: 'email_verify', usedAt: null },
          }),
        ]);
      } else {
        const slug = await uniqueChurchSlug(slugify(input.churchName));
        user = await prisma.user.create({
          data: {
            email: input.email,
            passwordHash,
            role: 'pastor',
            fullName: input.fullName,
            churches: {
              create: {
                name: input.churchName,
                slug,
                plan: 'starter',
                subscriptionStatus: 'trialing',
                trialEndsAt,
                city: location.city,
                state: location.state,
                country: location.country,
              },
            },
          },
        });
      }
    } else if (reclaiming) {
      [user] = await prisma.$transaction([
        prisma.user.update({
          where: { id: existing.id },
          data: {
            passwordHash,
            fullName: input.fullName,
            city: location.city,
            state: location.state,
            country: location.country,
          },
        }),
        prisma.verificationToken.deleteMany({
          where: { userId: existing.id, purpose: 'email_verify', usedAt: null },
        }),
      ]);
    } else {
      user = await prisma.user.create({
        data: {
          email: input.email,
          passwordHash,
          role: 'seeker',
          fullName: input.fullName,
          city: location.city,
          state: location.state,
          country: location.country,
        },
      });
    }

    await recordTermsAcceptance(prisma, user.id, req);

    try {
      await issueVerificationEmail(user);
    } catch (err) {
      // Don't fail the signup over a flaky email send — the account still
      // exists, and /api/auth/verify-email/send (email-only, unauthenticated
      // variant) lets them request another one before they've signed in.
      console.error('Failed to send verification email during signup', err);
    }

    trackEvent(user.id, 'user_signed_up', { role: user.role }).catch((err) =>
      console.error('Failed to track signup event', err)
    );

    return NextResponse.json({
      email: user.email,
      role: user.role,
      needsVerification: true,
    });
  } catch (err) {
    if (err.code === 'P2002') {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
    }
    console.error('Signup failed', err);
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }
}
