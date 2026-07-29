// Single source of truth for what each ChurchPlan tier actually gets. The
// free tier stays keyed as `starter` in the DB/enum (avoids an enum rename
// migration) but is labeled "Free" everywhere it's shown to users.
//
// Mux's `new_asset_settings.max_resolution_tier` only accepts
// '1080p' | '1440p' | '2160p' — there's no '720p' option (1080p is Mux's
// floor). So `starter` requests the same '1080p' Mux asset tier as
// `ministry`, and the "720p for Free" cap is enforced client-side instead,
// via mux-player's `max-resolution="720p"` attribute on the public viewing
// page (see public/church.html) — a real, effective cap, just applied at a
// different layer than storage.
export const PLANS = {
  starter: {
    key: 'starter',
    label: 'Free',
    priceId: null,
    maxResolutionTier: '1080p',
    playerMaxResolution: '720p',
    maxConcurrentViewers: 100,
    storageHoursCap: 10,
    allowRecurringGiving: false,
    monthlyGivingCapCents: 10000, // $100
    platformFeeRate: 0.05,
    analyticsTier: 'basic',
    features: [],
  },
  ministry: {
    key: 'ministry',
    label: 'Ministry',
    priceIds: { month: process.env.STRIPE_PRICE_MINISTRY, year: process.env.STRIPE_PRICE_MINISTRY_ANNUAL },
    // Matches the marketing pricing section's own numbers exactly (see
    // reference/mockup.html's price-amt data-m/data-y attributes) rather
    // than recomputing a discount from scratch.
    priceCents: { month: 4900, year: 46800 },
    maxResolutionTier: '1080p',
    playerMaxResolution: null,
    maxConcurrentViewers: null,
    storageHoursCap: null,
    allowRecurringGiving: true,
    monthlyGivingCapCents: 100000, // $1,000
    platformFeeRate: 0.025,
    analyticsTier: 'full',
    // Ministry and Congregation now share the full feature set below — the
    // only real differences between the two paid tiers are resolution cap
    // (1080p vs 4K), analyticsTier (full vs pro, which gates the Analytics
    // panel's CSV/donor-report export specifically), and the giving
    // cap/platform fee. Kept as a separate array (not a reference to
    // PLANS.congregation.features, which isn't defined yet at this point in
    // the object literal) so each tier's list stays independently editable.
    features: [
      'qr_giving', 'stream_scheduling', 'stream_overlays', 'donor_notes', 'accounting_export',
      'green_room', 'simulcast', 'polls_prayer_requests', 'live_captions',
      'giving_funds', 'text_to_give', 'calendar_sync',
    ],
  },
  congregation: {
    key: 'congregation',
    label: 'Congregation',
    priceIds: { month: process.env.STRIPE_PRICE_CONGREGATION, year: process.env.STRIPE_PRICE_CONGREGATION_ANNUAL },
    priceCents: { month: 9900, year: 94800 },
    maxResolutionTier: '2160p',
    playerMaxResolution: null,
    maxConcurrentViewers: null,
    storageHoursCap: null,
    allowRecurringGiving: true,
    monthlyGivingCapCents: null, // unlimited
    platformFeeRate: 0.019,
    analyticsTier: 'pro',
    features: [
      'qr_giving', 'stream_scheduling', 'stream_overlays', 'donor_notes', 'accounting_export',
      'green_room', 'simulcast', 'polls_prayer_requests', 'live_captions',
      'giving_funds', 'text_to_give', 'calendar_sync',
    ],
  },
};

// Never throws — an unrecognized/null plan key fails closed to the most
// restrictive tier rather than silently granting unlimited access.
export function getPlan(planKey) {
  return PLANS[planKey] || PLANS.starter;
}

// Gates a feature-flagged route/UI panel to the plans that include it — same
// fail-closed default as getPlan (an unrecognized church.plan resolves to
// starter's empty feature list, so it denies rather than grants access).
export function planHasFeature(church, featureKey) {
  return getPlan(church.plan).features.includes(featureKey);
}

// Fails closed to 'month' on an unrecognized interval — same fail-closed
// spirit as getPlan falling back to starter.
export function getPlanPriceId(planKey, interval) {
  const priceIds = getPlan(planKey).priceIds || {};
  return priceIds[interval] || priceIds.month;
}

// Every real Stripe price id across every paid plan and both billing
// intervals — used by the webhook to classify an invoice's subscription as
// a plan subscription (vs. a recurring-donation subscription, which uses a
// dynamically-created price with no fixed id of its own).
export const ALL_PLAN_PRICE_IDS = [PLANS.ministry, PLANS.congregation].flatMap((p) =>
  Object.values(p.priceIds)
);
