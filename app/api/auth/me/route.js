import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

// The session cookie is httpOnly, so the frontend can't decode it directly —
// this gives client-side code a way to ask "who's logged in".
export async function GET() {
  const user = await getCurrentUser();
  // A 2FA-pending partial session isn't a real sign-in for nav/dashboard
  // purposes — same treatment as requireUser() gives every other route, so
  // the client doesn't briefly render a dashboard shell that then fails to
  // load anything.
  if (!user || user.twoFactorPending) {
    return NextResponse.json({ user: null });
  }
  return NextResponse.json({ user: { id: user.sub, role: user.role, email: user.email } });
}
