// Dev-only helper for testing the three subscription tiers locally, since
// there's no self-serve upgrade button wired into the dashboard UI yet (only
// the underlying /api/stripe/subscription route). Sets a pastor's church
// plan directly in the database — reload the dashboard after running this
// to see the new tier's caps/fees/analytics take effect immediately.
//
// Usage:
//   node scripts/set-plan.js <pastor-email> <starter|ministry|congregation>
const { PrismaClient } = require('@prisma/client');

const VALID_PLANS = ['starter', 'ministry', 'congregation'];

async function main() {
  const [, , email, plan] = process.argv;

  if (!email || !VALID_PLANS.includes(plan)) {
    console.error('Usage: node scripts/set-plan.js <pastor-email> <starter|ministry|congregation>');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.role !== 'pastor') {
      console.error(`No pastor account found for ${email}`);
      process.exit(1);
    }

    const church = await prisma.church.findFirst({ where: { ownerId: user.id } });
    if (!church) {
      console.error(`No church found for ${email}`);
      process.exit(1);
    }

    await prisma.church.update({ where: { id: church.id }, data: { plan } });
    console.log(`${church.name} (${email}) is now on the ${plan} plan.`);
  } finally {
    await prisma.$disconnect();
  }
}

main();
