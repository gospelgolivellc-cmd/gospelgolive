import { NextResponse } from 'next/server';
import ical from 'ical-generator';
import { prisma } from '@/lib/prisma';
import { planHasFeature } from '@/lib/plans';

// Congregation-only. A stable, subscribable .ics feed — no OAuth needed,
// works with Google/Apple/Outlook's "subscribe from URL" flow. The dynamic
// segment carries the literal ".ics" suffix (e.g. "grace-chapel.ics"); we
// just strip it back off to get the church slug.
export async function GET(req, { params }) {
  const { slug: rawSlug } = await params;
  const slug = rawSlug.endsWith('.ics') ? rawSlug.slice(0, -4) : rawSlug;

  const church = await prisma.church.findUnique({ where: { slug } });
  if (!church) {
    return NextResponse.json({ error: 'Church not found' }, { status: 404 });
  }
  if (!planHasFeature(church, 'calendar_sync')) {
    return NextResponse.json(
      { error: 'Calendar sync requires the Congregation plan.', code: 'PLAN_UPGRADE_REQUIRED' },
      { status: 403 }
    );
  }

  // Only one persistent stream per church in this app's model (see
  // app/api/streams/provision/route.js), so this feed will only ever carry
  // zero or one upcoming event — not a full multi-event calendar.
  const streams = await prisma.stream.findMany({
    where: { churchId: church.id, scheduledAt: { not: null } },
    select: { id: true, title: true, description: true, scheduledAt: true },
  });

  const calendar = ical({ name: `${church.name} — Live Streams` });
  streams.forEach((s) => {
    calendar.createEvent({
      id: s.id,
      start: s.scheduledAt,
      // Live services don't have a known end time ahead of time — an hour
      // is a reasonable default a calendar app can display.
      end: new Date(new Date(s.scheduledAt).getTime() + 60 * 60 * 1000),
      summary: s.title,
      description: s.description || `Watch live at ${process.env.NEXT_PUBLIC_APP_URL || ''}/church.html?slug=${church.slug}`,
      url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/church.html?slug=${church.slug}`,
    });
  });

  return new NextResponse(calendar.toString(), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${church.slug}.ics"`,
    },
  });
}
