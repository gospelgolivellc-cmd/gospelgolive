import LegalDoc from '../_legal/LegalDoc';

export const metadata = {
  title: 'Cookie Policy — GospelGoLive.com',
  description: 'Cookie Policy for GospelGoLive.com',
};

export default function CookiePolicyPage() {
  return (
    <LegalDoc title="GospelGoLive.com — Cookie Policy" effectiveDate="July 26, 2026" lastUpdated="July 26, 2026">
      <h2>1. What This Policy Covers</h2>
      <p>
        This Cookie Policy explains how GospelGoLive, operated by [LEGAL ENTITY NAME], uses cookies
        and similar technologies (like browser local storage) when you use our website and app
        (the &quot;Service&quot;). It supplements our <a href="/privacy">Privacy Policy</a>, which covers how
        we handle personal information more broadly.
      </p>

      <h2>2. Strictly Necessary Cookies</h2>
      <p>
        These keep the Service working and can&apos;t be turned off through the cookie banner — they
        don&apos;t require consent because the Service can&apos;t function without them.
      </p>
      <ul>
        <li><strong>Session cookie:</strong> keeps you signed in between page loads.</li>
        <li><strong>OAuth state cookie:</strong> a short-lived cookie used only during the few seconds of a Google or Twitter sign-in redirect, to confirm the response came back from the provider you actually sent the visitor to.</li>
        <li><strong>Stripe cookies:</strong> set by Stripe during checkout and payout onboarding, for fraud prevention and to process payments.</li>
      </ul>

      <h2>3. Analytics Cookies</h2>
      <p>
        We use PostHog to understand how the Service is used — which pages get visited, which
        features get clicked, and how people move through sign-up and giving flows — so we can find
        what&apos;s confusing or broken and fix it. This is the only category the cookie banner actually
        controls: PostHog does not start collecting anything until you click <strong>Accept All</strong>,
        and if you click <strong>Decline</strong>, it never loads for that visit.
      </p>
      <p>
        You can change your mind at any time by clearing your browser&apos;s local storage for this
        site, which will show the banner again on your next visit.
      </p>

      <h2>4. Changes to This Policy</h2>
      <p>
        We may update this Cookie Policy from time to time, for example if we add a new analytics or
        advertising provider. Material changes will be reflected in the &quot;Last updated&quot; date above.
      </p>

      <h2>5. Contact Us</h2>
      <p>
        Questions about this Cookie Policy can be directed to [privacy@gospelgolive.com].
      </p>
    </LegalDoc>
  );
}
