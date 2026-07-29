import Link from 'next/link';
import LegalDoc from '../_legal/LegalDoc';

export const metadata = {
  title: 'Go Live Guide — GospelGoLive.com',
  description: 'A practical, start-to-finish guide to streaming your service on GospelGoLive.',
};

export default function GoLiveGuidePage() {
  return (
    <LegalDoc title="Go Live Guide">
      <p>
        A practical, start-to-finish guide to streaming your first (or five-hundredth) service on
        GospelGoLive.
      </p>

      <h2>Before you go live</h2>

      <p>
        <strong>1. Complete identity verification.</strong> Every pastor account needs this before
        going live, regardless of plan, it&apos;s what keeps giving on the platform trustworthy for
        everyone. If you haven&apos;t finished this, you&apos;ll see a prompt in your dashboard; it
        takes a few minutes through our payment partner, Stripe.
      </p>
      <p>
        <strong>2. Know your plan&apos;s limits.</strong> Free plans stream in 720p with a cap of 100
        viewers per stream. Ministry raises that to unlimited viewers in 1080p. Congregation adds 4K
        and a handful of production features covered below. If you&apos;re consistently bumping
        against a limit, that&apos;s usually a good sign, see <Link href="/#pricing">Pricing</Link> to
        compare plans.
      </p>
      <p>
        <strong>3. Choose how you&apos;ll stream.</strong> Most pastors go live directly from a camera
        or phone connected to their computer, no extra software required. If you already use broadcast
        software like OBS or vMix (for multi-camera setups, on-screen graphics, or streaming from a
        dedicated production room), you can connect that instead using your stream key, found in your
        Go Live settings.
      </p>

      <h2>Going live, step by step</h2>
      <ol>
        <li><strong>From your dashboard, select &quot;Go Live.&quot;</strong></li>
        <li>
          <strong>Add a title and description.</strong> Something specific (&quot;Sunday Morning
          Worship, Living Hope Fellowship&quot;) helps both regular followers and new visitors know
          what they&apos;re joining.
        </li>
        <li>
          <strong>(Optional) Schedule it in advance.</strong> On Ministry and Congregation plans, you
          can schedule a stream ahead of time, it appears on your public &quot;Upcoming&quot; page so
          followers know when to expect you, rather than only finding out once you&apos;re already
          live.
        </li>
        <li>
          <strong>(Congregation only) Set up a green room.</strong> This shows followers a countdown
          screen with your service start time instead of a blank &quot;offline&quot; page if they
          arrive early.
        </li>
        <li>
          <strong>Press &quot;Go Live.&quot;</strong> Within a few seconds, your stream is visible to
          your followers and on your public channel page.
        </li>
      </ol>

      <h2>While you&apos;re live</h2>
      <ul>
        <li>
          <strong>Watch your viewer count and elapsed time</strong> directly in the Go Live panel.
        </li>
        <li>
          <strong>Engage through chat.</strong> If enabled, viewers can send messages during your
          stream, a good moment for a media volunteer to keep an eye on things, since live chat isn&apos;t
          automatically moderated in real time.
        </li>
        <li>
          <strong>(Congregation only) Run a poll or collect prayer requests.</strong> These show up
          live to your viewers and are saved for you to review afterward.
        </li>
        <li>
          <strong>(Congregation only) Simulcast to YouTube and Facebook.</strong> If you&apos;ve
          connected those accounts in Settings, your stream broadcasts to all three places
          simultaneously, with everything still reporting back into your GospelGoLive analytics.
        </li>
      </ul>

      <h2>After your stream ends</h2>
      <p>
        Your stream is automatically saved to your on-demand sermon library, there&apos;s no separate
        upload step. A few things worth doing right after:
      </p>
      <ul>
        <li>
          <strong>Check and edit the title, thumbnail, and category</strong> if anything needs
          polishing for the permanent version.
        </li>
        <li>
          <strong>Glance at your analytics</strong>, viewer count, watch time, and (on Ministry and
          Congregation) where in the stream people dropped off, which is one of the more useful signals
          for planning your next one.
        </li>
      </ul>

      <h2>A few things that consistently help</h2>
      <ul>
        <li>
          <strong>Consistency matters more than production value.</strong> Churches that stream on a
          predictable weekly schedule tend to build a much stronger following than those with
          occasional, high-production streams, showing up reliably beats occasional perfection.
        </li>
        <li>
          <strong>Good audio matters more than good video.</strong> If you have to choose where to
          invest, a clear microphone will do more for your stream than a better camera.
        </li>
        <li>
          <strong>Promote it before you go live</strong>, not just after. Scheduling your stream in
          advance and sharing that link with your congregation during the week consistently drives
          more live viewers than posting only once you&apos;re already on air.
        </li>
      </ul>

      <h2>Troubleshooting</h2>
      <p>
        <strong>&quot;I hit my viewer cap mid-stream.&quot;</strong> This means your Free plan&apos;s
        100-viewer limit has been reached, existing viewers aren&apos;t removed, but new viewers
        won&apos;t be able to join until you upgrade. This is usually the clearest sign it&apos;s time
        to move to Ministry.
      </p>
      <p>
        <strong>&quot;Simulcast to YouTube/Facebook failed to connect.&quot;</strong> This almost
        always means the stream key entered in Settings has expired or changed, YouTube and Facebook
        periodically rotate these. Re-enter the current key from your YouTube/Facebook Studio and try
        again.
      </p>
      <p>
        <strong>&quot;My stream looks delayed or is buffering for viewers.&quot;</strong> This is
        typically about the pastor&apos;s upload connection, not GospelGoLive itself, a wired internet
        connection, if available, is meaningfully more stable than Wi-Fi for live streaming.
      </p>

      <div className="callout">
        <p style={{ margin: 0 }}>
          Still stuck? <Link href="/contact">Contact us</Link> or reach us directly at{' '}
          <a href="mailto:support@gospelgolive.com">support@gospelgolive.com</a>, for anything
          time-sensitive, like a stream issue happening right before a service, mention that in your
          subject line and we&apos;ll prioritize it.
        </p>
      </div>
    </LegalDoc>
  );
}
