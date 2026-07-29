import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { saveUploadedImage } from '@/lib/uploads';

// Banner belongs to the church page, so only a pastor (the church owner) can set it.
export async function POST(req) {
  const { user, error } = await requireUser('pastor');
  if (error) return error;

  const church = await prisma.church.findFirst({ where: { ownerId: user.sub } });
  if (!church) {
    return NextResponse.json({ error: 'No church found for this account' }, { status: 404 });
  }

  const form = await req.formData();
  const file = form.get('file');

  let url;
  try {
    url = await saveUploadedImage(file, 'banner', church.id);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  await prisma.church.update({ where: { id: church.id }, data: { bannerUrl: url } });

  return NextResponse.json({ bannerUrl: url });
}
