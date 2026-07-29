import { prisma } from '@/lib/prisma';
import { resend } from '@/lib/resend';
import { sendWaitlistWelcomeEmail } from '@/lib/email';

const AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID;

// Adds an email to the pre-launch waitlist: persists it (our source of
// truth — survives even if a Resend contact gets edited/removed), mirrors
// it into the Resend Audience so campaign broadcasts can reach it, and
// sends the instant confirmation email. Idempotent — a repeat signup from
// the same address is treated as success rather than an error.
export async function addToWaitlist(email) {
  const existing = await prisma.waitlistSignup.findUnique({ where: { email } });
  if (existing) return { alreadySubscribed: true };

  let resendContactId = null;
  if (AUDIENCE_ID) {
    try {
      const { data, error } = await resend.contacts.create({
        audienceId: AUDIENCE_ID,
        email,
        unsubscribed: false,
      });
      if (error) throw new Error(error.message);
      resendContactId = data.id;
    } catch (err) {
      // Don't block signup on Audience sync — the DB row is the source of
      // truth and this can be backfilled once the sync issue is resolved.
      console.error('Failed to add contact to Resend audience', err);
    }
  }

  await prisma.waitlistSignup.create({ data: { email, resendContactId } });

  try {
    await sendWaitlistWelcomeEmail(email);
  } catch (err) {
    console.error('Failed to send waitlist welcome email', err);
  }

  return { alreadySubscribed: false };
}
