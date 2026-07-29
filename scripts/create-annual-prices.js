// One-off setup script — creates the real annual Stripe Prices for the
// Ministry/Congregation plans (test mode), attached to the same Product as
// each plan's existing monthly Price. Prints the new Price ids; paste them
// into .env.local as STRIPE_PRICE_MINISTRY_ANNUAL / STRIPE_PRICE_CONGREGATION_ANNUAL.
// Catalog-only — creates no charges, nothing to clean up.
//
// Usage:
//   node scripts/create-annual-prices.js
const fs = require('fs');
const path = require('path');

// This project's Next.js process gets .env.local loaded automatically;
// a plain `node` invocation of a one-off script doesn't, so load it here.
const envPath = path.join(__dirname, '..', '.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}

const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Matches the marketing pricing section's existing "$49/mo -> $39/mo billed
// annually" / "$99/mo -> $79/mo billed annually" figures exactly (see
// reference/mockup.html's price-amt data-y attributes) rather than
// recomputing a fresh discount.
const ANNUAL_PLANS = [
  { key: 'ministry', monthlyPriceEnv: 'STRIPE_PRICE_MINISTRY', annualUnitAmount: 46800 },
  { key: 'congregation', monthlyPriceEnv: 'STRIPE_PRICE_CONGREGATION', annualUnitAmount: 94800 },
];

async function main() {
  for (const { key, monthlyPriceEnv, annualUnitAmount } of ANNUAL_PLANS) {
    const monthlyPriceId = process.env[monthlyPriceEnv];
    if (!monthlyPriceId) {
      console.error(`${monthlyPriceEnv} is not set — cannot look up the product to attach the annual price to.`);
      process.exit(1);
    }

    const monthlyPrice = await stripe.prices.retrieve(monthlyPriceId);
    const annualPrice = await stripe.prices.create({
      product: monthlyPrice.product,
      currency: 'usd',
      unit_amount: annualUnitAmount,
      recurring: { interval: 'year' },
    });

    console.log(`${key}: STRIPE_PRICE_${key.toUpperCase()}_ANNUAL=${annualPrice.id}`);
  }
}

main().catch((err) => {
  console.error('Failed to create annual prices', err);
  process.exit(1);
});
