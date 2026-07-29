import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { saveUploadedImage } from '@/lib/uploads';
import { planHasFeature } from '@/lib/plans';

// Ministry+ stream overlay — a branded image frame rendered around the
// player on the public church page (not composited into the video itself;
// see the 'stream_overlays' feature note in lib/plans.js).
export async function POST(req) {
  const { user, error } = await requireUser('pastor');
  if (error) return error;

  const church = await prisma.church.findFirst({ where: { ownerId: user.sub } });
  if (!church) {
    return NextResponse.json({ error: 'No church found for this account' }, { status: 404 });
  }
  if (!planHasFeature(church, 'stream_overlays')) {
    return NextResponse.json(
      { error: 'Stream overlays require the Ministry plan or higher.', code: 'PLAN_UPGRADE_REQUIRED' },
      { status: 403 }
    );
  }

  const form = await req.formData();
  const file = form.get('file');

  let url;
  try {
    url = await saveUploadedImage(file, 'overlay', church.id);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  await prisma.church.update({ where: { id: church.id }, data: { overlayImageUrl: url } });

  return NextResponse.json({ overlayImageUrl: url });
}

export async function DELETE() {
  const { user, error } = await requireUser('pastor');
  if (error) return error;

  const church = await prisma.church.findFirst({ where: { ownerId: user.sub } });
  if (!church) {
    return NextResponse.json({ error: 'No church found for this account' }, { status: 404 });
  }

  await prisma.church.update({ where: { id: church.id }, data: { overlayImageUrl: null } });
  return NextResponse.json({ ok: true });
}
