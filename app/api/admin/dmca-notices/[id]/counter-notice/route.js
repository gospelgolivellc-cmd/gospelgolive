import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { recordCounterNotice } from '@/lib/dmca';

const schema = z.object({ notes: z.string().optional() });

// Records that the account holder filed a counter-notice against a
// takedown (DMCA Copyright Policy section 3) — an admin enters this once
// they've confirmed a real counter-notice was received containing its own
// required elements (signature, identification of the removed material, a
// good-faith statement, and consent to jurisdiction).
export async function POST(req, { params }) {
  const { user, error } = await requireUser('admin');
  if (error) return error;

  const { id } = await params;
  let input;
  try {
    input = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request', details: err.errors }, { status: 400 });
  }

  try {
    await recordCounterNotice(id, { adminUserId: user.sub, notes: input.notes });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
