import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { reviewContentReport } from '@/lib/moderation';
import { resolveFraudReport } from '@/lib/detectSuspiciousGiving';

const schema = z.object({ decision: z.string(), notes: z.string().optional() });

// Dispatches an admin's review-queue decision to the right resolver
// depending on what kind of report it is: content reports (nudity/violence/
// spam/other on a sermon or stream) go through lib/moderation.js's
// approve/remove path, fraud_suspicion reports (a church or donor flagged by
// lib/detectSuspiciousGiving.js) go through its own clear/confirm path.
// CSAM reports deliberately have no path here at all — see lib/moderation.js.
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

  const report = await prisma.contentReport.findUnique({ where: { id } });
  if (!report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  try {
    const result =
      report.category === 'fraud_suspicion'
        ? await resolveFraudReport(id, { decision: input.decision, adminUserId: user.sub, notes: input.notes })
        : await reviewContentReport(id, { decision: input.decision, adminUserId: user.sub, notes: input.notes });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
