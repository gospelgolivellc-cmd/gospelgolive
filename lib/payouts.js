import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';

// Hold-and-distribute payment model: every gift is charged directly onto the
// platform's own Stripe balance (see app/api/donations/intent + subscription
// routes — neither uses transfer_data/application_fee at charge time). This
// module moves each church's net share out to their connected account right
// after the charge succeeds, and claws it back if the charge is later
// refunded or disputed.

// Called right after a Donation row is created for a newly-succeeded charge.
// Tolerates failure (e.g. the connected account isn't fully payout-ready, or
// the transfer amount momentarily exceeds available balance) by leaving
// stripeTransferId null rather than throwing — the donation is still
// recorded with the correct gross/fee/net split, it just needs manual
// follow-up to actually pay the church. donation.stripeTransferId == null
// on an otherwise-complete row is the signal that a payout is still owed
// (also true, deliberately, while a church is under fraud review below —
// an admin clearing verificationStatus back to 'active' unblocks the same
// still-outstanding transfer rather than needing a separate backfill job).
export async function transferDonationPayout(donation, church, chargeId) {
  if (!church.stripeAccountId || donation.netCents <= 0) return;
  // Trust & Safety financial-crime hold (see lib/detectSuspiciousGiving.js)
  // — giving and streaming keep working normally, only the payout itself
  // pauses while the review is open.
  if (church.verificationStatus === 'flagged') return;
  try {
    const transfer = await stripe.transfers.create({
      amount: donation.netCents,
      currency: 'usd',
      destination: church.stripeAccountId,
      // Ties the transfer to the charge it came from so it draws against
      // that charge's settled funds rather than the platform's general
      // available balance.
      source_transaction: chargeId,
      metadata: { donation_id: donation.id },
    });
    await prisma.donation.update({
      where: { id: donation.id },
      data: { stripeTransferId: transfer.id },
    });
  } catch (err) {
    console.error(`Failed to transfer payout for donation ${donation.id} to ${church.stripeAccountId}`, err);
  }
}

// Called from charge.refunded / charge.dispute.created webhooks.
// `targetTotalReversedCents` is the *cumulative* amount that should have
// been clawed back by now (netCents scaled by however much of the gross
// charge has been refunded/disputed so far) — not an incremental delta.
// Comparing against donation.reversedCents makes repeat calls safe against
// Stripe's at-least-once webhook delivery and against multiple partial
// refunds on the same charge.
export async function reverseDonationPayout(donation, targetTotalReversedCents) {
  if (!donation.stripeTransferId) return; // nothing was ever paid out — the refund alone unwinds it
  const target = Math.min(targetTotalReversedCents, donation.netCents);
  const delta = target - donation.reversedCents;
  if (delta <= 0) return;
  try {
    await stripe.transfers.createReversal(donation.stripeTransferId, { amount: delta });
    await prisma.donation.update({
      where: { id: donation.id },
      data: { reversedCents: target },
    });
  } catch (err) {
    console.error(`Failed to reverse transfer ${donation.stripeTransferId} for donation ${donation.id}`, err);
  }
}
