// Content for the Free-plan-pastor upgrade campaign. Targets churches
// currently on the 'starter' (Free) plan — see scripts/sync-upgrade-audience.js
// for how that list gets synced into the Resend Audience this ties to.
//
// `bodyHtml` is the only field you'd normally touch — plain <p>/<ul> markup.
// Edit here (not in the Resend dashboard) if you want to be able to re-run
// scripts/create-upgrade-campaign.js later and have it stay in sync —
// dashboard edits get overwritten the next time the script runs.
module.exports = {
  name: 'Upgrade pitch — Free plan pastors',
  subject: 'Your congregation wants to give you offerings 🙏',
  previewText: 'Recurring giving and 4K streaming are one upgrade away.',
  bodyHtml: `
    <p>Your congregation wants to give you offerings — right now, your Free plan is what's standing in the way.</p>
    <p>Two things you're missing out on:</p>
    <ul>
      <li><strong>Recurring giving.</strong> On Free, every gift has to be a one-time, manual entry — there's no way for your members to set up automatic monthly offerings. Ministry and Congregation plans turn that on.</li>
      <li><strong>4K streaming.</strong> Your services are capped well below full quality. Congregation unlocks true 4K, so your broadcasts look as good as the message you're delivering.</li>
    </ul>
    <p>Upgrading takes two minutes from your dashboard, and you can switch plans any time.</p>
  `,
};
