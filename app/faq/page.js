import Link from 'next/link';
import LegalDoc from '../_legal/LegalDoc';

export const metadata = {
  title: 'FAQ — GospelGoLive.com',
  description: 'Frequently asked questions about GospelGoLive.',
};

export default function FaqPage() {
  return (
    <LegalDoc title="GospelGoLive.com — Frequently Asked Questions">
      <h2>General</h2>

      <h3>What is GospelGoLive?</h3>
      <p>
        GospelGoLive is a home for live worship, sermons on demand, and giving, built so pastors can
        reach their congregation online, and so anyone looking for a church can actually find one.
      </p>

      <h3>Do I need an account to watch a sermon?</h3>
      <p>
        No. Browsing and watching sermons is open to everyone. You only need an account to follow a
        church, get notified when a pastor goes live, or give.
      </p>

      <h3>Is GospelGoLive free?</h3>
      <p>
        For Sermon Seekers, yes, completely, including giving. For Pastors, there&apos;s a permanent
        free tier, plus Ministry ($49/month) and Congregation ($99/month) plans as a ministry grows.
        See our <Link href="/#pricing">Pricing</Link> section for the full breakdown.
      </p>

      <h2>For Sermon Seekers</h2>

      <h3>How does GospelGoLive help me find a church?</h3>
      <p>
        When you sign up, you tell us what you&apos;re interested in (Worship, Bible Study, Prayer, and
        more), and optionally your general location. We use that, along with what you actually watch,
        to recommend churches and sermons that fit you, and to highlight ministries near you.
      </p>

      <h3>Will I know when a pastor I follow goes live?</h3>
      <p>
        Yes, if you turn on notifications for that channel. You can control this per church, so
        you&apos;re not stuck choosing between all notifications or none.
      </p>

      <h3>What if I miss a live service?</h3>
      <p>
        Every stream automatically becomes part of that church&apos;s on-demand sermon library once it
        ends, nothing is lost if you weren&apos;t there live.
      </p>

      <h3>Does it cost me anything to give?</h3>
      <p>
        No. <strong>100% of your gift goes to the church</strong>, GospelGoLive never charges the
        person giving, ever. (The platform fee, when there is one, is paid by the pastor&apos;s
        account, not you. See &quot;What fees do pastors pay?&quot; below.)
      </p>

      <h3>Can I give anonymously?</h3>
      <p>
        Yes, one-time gifts can be made anonymously. Recurring gifts require an account so you can
        manage or cancel them later.
      </p>

      <h3>Do I get a receipt for tax purposes?</h3>
      <p>
        It depends on the church. If you give to a church verified as a tax-exempt organization,
        you&apos;ll receive an annual giving statement suitable for your taxes. If you give to an
        individual minister who hasn&apos;t completed that verification, you&apos;ll get a giving
        summary for your own records, but it won&apos;t be tax-deductible, we&apos;ll always tell you
        which kind of gift you&apos;re making before you give.
      </p>

      <h2>For Pastors</h2>

      <h3>Do I need to be part of an established church to sign up?</h3>
      <p>
        No, this is important to us. <strong>Individual ministers with no formal church entity are
        genuinely welcome here</strong>, not just incorporated organizations. You can register, verify
        your identity, go live, and start receiving support from your community right away. Full
        church verification unlocks additional things (a higher giving limit, tax-deductible receipts
        for your supporters), but it&apos;s not a requirement to get started.
      </p>

      <h3>What&apos;s the difference between the plans?</h3>
      <table>
        <thead>
          <tr>
            <th></th>
            <th>Free</th>
            <th>Ministry ($49/mo)</th>
            <th>Congregation ($99/mo)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Streaming</td>
            <td>720p, 100 viewers/stream</td>
            <td>1080p, unlimited viewers</td>
            <td>1080p &amp; 4K, unlimited</td>
          </tr>
          <tr>
            <td>Giving</td>
            <td>One-time only, $100/mo</td>
            <td>One-time + recurring, $1,000/mo</td>
            <td>One-time + recurring, unlimited</td>
          </tr>
          <tr>
            <td>Platform fee</td>
            <td>5%</td>
            <td>2.5%</td>
            <td>1.9%</td>
          </tr>
        </tbody>
      </table>
      <p>
        Ministry adds QR code giving, stream scheduling, custom overlays, donor notes, and accounting
        export. Congregation adds simulcasting, live captions, multiple giving funds, text-to-give,
        and more. Full details on our <Link href="/#pricing">Pricing</Link> section.
      </p>

      <h3>What do I need before I can go live or receive gifts?</h3>
      <p>
        Identity verification, which takes a few minutes through our payment partner, Stripe. This is
        required for every pastor account, regardless of plan, before any streaming or giving can
        happen.
      </p>

      <h3>What happens if my subscription payment fails?</h3>
      <p>
        We&apos;ll automatically retry on day 3 and day 7. If payment still hasn&apos;t gone through
        after that, your ability to go live, upload, and view analytics pauses until it&apos;s
        resolved, but <strong>your existing sermon library stays visible, and giving to your church
        continues uninterrupted.</strong> Access is restored the moment payment succeeds, with no
        waiting period.
      </p>

      <h3>Can I change plans later?</h3>
      <p>Yes, anytime. Upgrades and downgrades take effect at your next billing cycle.</p>

      <h2>Giving &amp; Offerings</h2>

      <h3>What fees do pastors actually pay?</h3>
      <p>
        It depends on your plan: <strong>5% on Free, 2.5% on Ministry, 1.9% on Congregation</strong>,
        charged only on gifts your church actually receives, never as a flat fee regardless of giving.
      </p>

      <h3>What&apos;s the difference between one-time and recurring giving?</h3>
      <p>
        A one-time gift is exactly that, a single contribution. Recurring giving repeats automatically
        (monthly, typically) until the donor cancels it. Recurring giving requires a Ministry plan or
        higher.
      </p>

      <h3>Are there limits on how much a church can receive?</h3>
      <p>
        Free plans have a $100/month cap on one-time gifts. Ministry raises that to $1,000/month with
        recurring giving enabled. Congregation has no cap. These limits exist alongside, not instead
        of, your verification tier; a brand-new, unverified account has a lower ceiling regardless of
        plan until identity verification is complete.
      </p>

      <h3>How fast do pastors get paid?</h3>
      <p>
        Payouts run on a regular weekly schedule to your connected bank account once your Stripe setup
        is complete.
      </p>

      <h2>Trust, Safety &amp; Verification</h2>

      <h3>How does GospelGoLive verify pastors?</h3>
      <p>
        In tiers, not one all-or-nothing check. Everyone completes identity verification before going
        live. From there, pastors can optionally pursue Ministry Verification (references or
        organizational documentation) and, for established organizations, Tax-Exempt Verification,
        which is what unlocks the ability to issue tax-deductible giving statements.
      </p>

      <h3>What content isn&apos;t allowed?</h3>
      <p>
        Sexually explicit or exploitative content is never permitted, full stop, and any content
        involving the exploitation of a minor is reported to the appropriate authorities immediately,
        we have zero tolerance here. Beyond that, content that infringes on someone else&apos;s
        copyright, facilitates illegal activity, or harasses or threatens others isn&apos;t permitted.
        Our full <a href="/terms#content">Community Guidelines</a> and <a href="/terms">Terms of
        Service</a> go into more detail.
      </p>

      <h3>How do I report something?</h3>
      <p>
        Every sermon, stream, and profile has a report option. Reports are reviewed by our team, and
        we&apos;ll follow up if action is taken on content you reported.
      </p>

      <h3>Is my payment information safe?</h3>
      <p>
        Yes, GospelGoLive never stores your full card or bank details. All payment processing runs
        through Stripe, a payment processor used by millions of businesses, with the same security
        standards used by major banks.
      </p>

      <h3>Does GospelGoLive offer two-factor authentication?</h3>
      <p>
        Yes, and we recommend it, especially for Pastor accounts given the financial access involved.
        You can enable it from your account settings.
      </p>

      <h2>Account &amp; Technical</h2>

      <h3>How do I sign up?</h3>
      <p>
        With Google, Facebook, or an email and password, whichever&apos;s easiest for you. If
        you&apos;re a pastor, you&apos;ll also tell us a bit about your ministry so we can route you to
        the right verification path.
      </p>

      <h3>I forgot my password. What do I do?</h3>
      <p>
        Use the &quot;Forgot password&quot; link on the sign-in page, we&apos;ll email you a secure,
        time-limited reset link.
      </p>

      <h3>How do I deactivate my account?</h3>
      <p>
        From your account settings. Your data is retained for a period in case you&apos;d like to
        return, after which it&apos;s permanently deleted, see our <a href="/privacy">Privacy
        Policy</a> for specifics.
      </p>

      <h3>Does GospelGoLive use cookies?</h3>
      <p>
        Yes, for keeping you signed in and, if you opt in, for understanding how the Service is used
        so we can improve it. We don&apos;t use cookies for advertising, and we never sell your data.
        Full detail is in our <a href="/cookie-policy">Cookie Policy</a>.
      </p>

      <h3>Where can I read the legal details?</h3>
      <p>
        Our <a href="/terms">Terms of Service</a>, <a href="/privacy">Privacy Policy</a>,{' '}
        <a href="/cookie-policy">Cookie Policy</a>, and <a href="/dmca">DMCA Policy</a> are all linked
        in the footer of every page.
      </p>

      <div className="callout">
        <p style={{ margin: 0 }}>
          Can&apos;t find what you&apos;re looking for? <a href="/contact">Contact us</a> or reach us
          directly at <a href="mailto:support@gospelgolive.com">support@gospelgolive.com</a>.
        </p>
      </div>
    </LegalDoc>
  );
}
