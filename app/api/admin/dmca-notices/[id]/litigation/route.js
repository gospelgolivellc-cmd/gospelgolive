import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { markLitigationFiled } from '@/lib/dmca';

const schema = z.object({ notes: z.string().optional() });

// Records that the original claimant notified us they've filed a lawsuit —
// blocks app/api/cron/dmca-restore from auto-restoring this content
// regardless of its restoreEligibleAt date (DMCA Copyright Policy section 3).
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
    await markLitigationFiled(id, { adminUserId: user.sub, notes: input.notes });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
