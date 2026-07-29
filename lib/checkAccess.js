// Gates go-live, upload, and analytics once a church's subscription payment
// has failed three times (day-0/3/7 dunning — see
// app/api/webhooks/stripe/route.js and app/api/cron/subscription-retries).
// Deliberately NOT applied to: donation/giving routes, the public sermon
// library, or the ability to sign in and view the billing page — a
// suspended pastor still needs to see and fix their payment method, and
// seekers should never be collateral damage from a pastor's billing issue.
export function hasActiveAccess(church) {
  return church.subscriptionStatus !== 'suspended';
}
