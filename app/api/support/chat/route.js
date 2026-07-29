import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimit } from '@/lib/rateLimit';
import { getSupportReply } from '@/lib/supportChat';

const schema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(2000),
      })
    )
    .min(1)
    .max(20),
});

// No auth required — this is a general-FAQ assistant available to signed-out
// visitors too, so it's rate-limited per IP instead of per-account.
export async function POST(req) {
  const limited = rateLimit(req, 'support-chat', { max: 20, windowMs: 60_000 });
  if (limited) return limited;

  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
  }

  try {
    const reply = await getSupportReply(input.messages);
    return NextResponse.json({ reply });
  } catch (err) {
    console.error('Support chat request failed', err);
    return NextResponse.json({ error: 'Something went wrong — please try again.' }, { status: 500 });
  }
}
