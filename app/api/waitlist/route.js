import { NextResponse } from 'next/server';
import { z } from 'zod';
import { addToWaitlist } from '@/lib/waitlist';

const waitlistSchema = z.object({ email: z.string().email() });

// Backs the "Notify Me" form on the coming-soon page. Unauthenticated by
// design — this is a public pre-launch signup, not an account.
export async function POST(req) {
  let input;
  try {
    input = waitlistSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
  }

  try {
    await addToWaitlist(input.email);
  } catch (err) {
    console.error('Waitlist signup failed', err);
    return NextResponse.json({ error: 'Something went wrong — please try again' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
