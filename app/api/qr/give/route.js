import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { planHasFeature } from '@/lib/plans';

// Ministry+ QR code giving. Generated on the fly from the church's existing
// give URL — no new schema, nothing to store or keep in sync. Scoped to the
// signed-in pastor's own church rather than an id in the URL.
export async function GET() {
  const { user, error } = await requireUser('pastor');
  if (error) return error;

  const church = await prisma.church.findFirst({ where: { ownerId: user.sub } });
  if (!church) {
    return NextResponse.json({ error: 'No church found for this account' }, { status: 404 });
  }
  if (!planHasFeature(church, 'qr_giving')) {
    return NextResponse.json(
      { error: 'QR code giving requires the Ministry plan or higher.', code: 'PLAN_UPGRADE_REQUIRED' },
      { status: 403 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
  const giveUrl = `${appUrl}/church.html?slug=${church.slug}`;

  try {
    const png = await QRCode.toBuffer(giveUrl, { width: 600, margin: 2 });
    return new NextResponse(png, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="${church.slug}-give-qr.png"`,
      },
    });
  } catch (err) {
    console.error('QR code generation failed', err);
    return NextResponse.json({ error: 'Failed to generate QR code' }, { status: 500 });
  }
}
