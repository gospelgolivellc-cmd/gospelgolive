import LegalDoc from '../_legal/LegalDoc';

export const metadata = {
  title: 'Privacy Policy — GospelGoLive.com',
  description: 'Privacy Policy for GospelGoLive.com',
};

export default function PrivacyPage() {
  return (
    <LegalDoc title="GospelGoLive.com — Privacy Policy" effectiveDate="July 26, 2026" lastUpdated="July 26, 2026">
      <h2>1. Introduction</h2>
      <p>
        This Privacy Policy explains how GospelGoLive, operated by [LEGAL ENTITY NAME], a [STATE]
        [ENTITY TYPE] (&quot;GospelGoLive,&quot; &quot;we,&quot; &quot;us&quot;), collects, uses, shares, and protects
        information when you use our website, mobile applications, and related services
        (collectively, the &quot;Service&quot;).
      </p>
      <p>
        We serve two kinds of users: <strong>Sermon Seekers</strong>, who browse, follow, watch, and
        give to churches and ministries, and <strong>Pastors</strong>, who create channels, stream
        live services, publish sermons, and receive gifts. This policy applies to both.
      </p>

      <h2>2. Information We Collect</h2>
      <h3>Information you provide directly</h3>
      <ul>
        <li>
          <strong>Account information:</strong> name, email address, and password, or the equivalent
          information provided by Google or Facebook if you sign in that way.
        </li>
        <li>
          <strong>Profile information:</strong> for Seekers, your stated interests and optional
          location (city/region). For Pastors, your church or ministry name, church size, ministry
          structure (individual minister or organization), bio, and channel details.
        </li>
        <li>
          <strong>Verification information:</strong> if you register as a Pastor, information
          required to verify your identity and (where applicable) your organization&apos;s tax status —
          including government ID, date of birth, and Social Security number, which are collected and
          processed directly by our payment partner, Stripe, and are not stored on our own servers.
          For organizations, this may also include your Employer Identification Number (EIN), legal
          organization name, and supporting documents such as an IRS determination letter.
        </li>
        <li>
          <strong>Content:</strong> sermons, live streams, thumbnails, descriptions, chat messages,
          prayer requests, and poll responses you submit through the Service.
        </li>
        <li>
          <strong>Payment information:</strong> processed directly by Stripe; we do not store full
          card numbers or bank account details on our own servers.
        </li>
        <li>
          <strong>Communications:</strong> messages you send us, including support requests and
          content reports.
        </li>
      </ul>
      <h3>Information collected automatically</h3>
      <ul>
        <li>
          <strong>Usage data:</strong> which sermons and streams you view, how long you watch, pages
          visited, and general interaction with the Service.
        </li>
        <li>
          <strong>Device and log data:</strong> IP address, browser type, device type, and similar
          technical information.
        </li>
        <li>
          <strong>Location data:</strong> if you don&apos;t provide your city/region directly, we may
          infer an approximate location from your IP address, stored separately and flagged as
          inferred rather than self-reported.
        </li>
        <li>
          <strong>Cookies and similar technologies:</strong> used for authentication, analytics
          (including Google Analytics on our public marketing pages and PostHog for in-product
          analytics), and remembering your preferences.
        </li>
      </ul>

      <h2>3. How We Use Information</h2>
      <p>We use the information above to:</p>
      <ul>
        <li>Provide, operate, and maintain the Service, including live streaming, sermon libraries, and giving.</li>
        <li>
          Personalize your experience, including recommending churches and sermons based on your
          stated interests, viewing history, and general location.
        </li>
        <li>Process payments, offerings, and subscription billing through Stripe.</li>
        <li>Verify Pastor accounts and prevent fraud, in accordance with our Trust &amp; Safety practices.</li>
        <li>Generate and deliver tax-related giving statements, where applicable (see Section 8).</li>
        <li>
          Send transactional communications (receipts, security alerts, account notices) and, where
          you&apos;ve opted in, marketing and product communications.
        </li>
        <li>
          Detect, investigate, and prevent fraud, abuse, and violations of our Terms of Service,
          including content that may violate the law.
        </li>
        <li>
          Comply with legal obligations, including mandatory reporting of child sexual abuse material
          as described in Section 9.
        </li>
      </ul>

      <h2>4. How We Share Information</h2>
      <p>
        <strong>We do not sell your personal information to third parties, including data brokers or
        advertisers.</strong>
      </p>
      <p>We share information only in the following circumstances:</p>
      <ul>
        <li>
          <strong>Service providers</strong> who help us operate the Service, including Stripe
          (payments and identity verification), Mux (video hosting and streaming), Supabase (database
          and authentication), Resend (email delivery), and analytics providers (Google Analytics,
          PostHog, Mux Data). Each is bound by contract to use your information only to provide
          services to us.
        </li>
        <li>
          <strong>Between users, in limited, aggregated form.</strong> Pastors can see aggregate
          audience analytics (for example, the general geographic distribution of their viewers), but
          never an individual seeker&apos;s precise location or identity tied to that data. Public
          profile information (your name, if you choose to display it, and your public activity such
          as follows) may be visible to other users as part of normal Service functionality.
        </li>
        <li>
          <strong>Legal and safety purposes</strong>, including in response to a subpoena, court
          order, or other legal process; to protect the rights, property, or safety of GospelGoLive,
          our users, or the public; and as described in our mandatory reporting obligations in Section
          9.
        </li>
        <li>
          <strong>Business transfers</strong>, if GospelGoLive is involved in a merger, acquisition, or
          sale of assets, in which case we will provide notice before your information becomes subject
          to a different privacy policy.
        </li>
      </ul>

      <h2>5. Your Choices and Rights</h2>
      <ul>
        <li>
          <strong>Notification preferences:</strong> you can control which behavioral and marketing
          emails you receive (digests, milestone updates, product announcements) from your account
          settings. Transactional emails (receipts, security alerts, account status changes) cannot
          be turned off, as they&apos;re necessary to operate your account.
        </li>
        <li>
          <strong>Access, correction, and deletion:</strong> you can review and update most account
          information directly. You may request a copy of your data or request deletion of your
          account by contacting [privacy@gospelgolive.com] or through your account settings.
        </li>
        <li>
          <strong>California residents</strong> may have additional rights under the California
          Consumer Privacy Act (CCPA), including the right to know what personal information we
          collect and to request deletion. [Placeholder — confirm applicability and specific required
          disclosures with counsel.]
        </li>
        <li>
          <strong>European residents</strong> may have rights under the General Data Protection
          Regulation (GDPR) if applicable. [Placeholder — confirm applicability; GospelGoLive&apos;s
          current primary market is the United States, and international data protection compliance
          should be reviewed specifically before onboarding users from applicable jurisdictions.]
        </li>
      </ul>

      <h2>6. Data Retention</h2>
      <p>
        We retain your information for as long as your account is active, plus a reasonable period
        afterward to comply with legal obligations, resolve disputes, and enforce our agreements. If
        you deactivate your account, we retain your data for [RETENTION PERIOD] before permanent
        deletion, during which you may reactivate your account.
      </p>
      <p>
        <strong>Important exception:</strong> if content is reported to the National Center for
        Missing &amp; Exploited Children (NCMEC) under our child safety obligations (Section 9), federal
        law requires us to preserve the reported material and associated records for 90 days,
        extendable to 180 days at law enforcement&apos;s request, regardless of any other deletion request
        or retention policy.
      </p>

      <h2>7. Children&apos;s Privacy</h2>
      <p>
        GospelGoLive is intended for users who are at least 18 years old. We do not knowingly collect
        personal information from anyone under 18. If we become aware that we&apos;ve collected
        information from a user under 18, we will take steps to delete it. [Placeholder — confirm this
        age threshold with counsel; if a lower minimum age is desired, this section will need to
        address COPPA compliance directly.]
      </p>

      <h2>8. Tax-Related Giving Information</h2>
      <p>
        If you give to a Pastor account verified as a tax-exempt organization, we generate and provide
        an annual giving statement for your tax records, including the total amount given, the
        organization&apos;s legal name, and (where applicable) its EIN. If you give to an individual
        minister who has not completed organization tax-exempt verification, we provide a giving
        summary for your personal records only, clearly marked as not tax-deductible. See our Terms of
        Service for further detail on the distinction between these account types.
      </p>

      <h2>9. Child Safety and Mandatory Reporting</h2>
      <p>
        GospelGoLive scans uploaded and live-streamed content for apparent child sexual abuse material
        (CSAM) using an industry-standard hash-matching and classification vendor. [Placeholder —
        CSAM vendor integration (an Enterprise-tier contract, separate from our general content
        moderation vendor) is not yet in place; do not represent this scanning as active in a published
        policy until that integration is under contract and verified live.] Once active, any confirmed
        detection is handled automatically with no human discretion, consistent with our zero-tolerance
        policy. Under U.S. federal law (18 U.S.C. § 2258A), we are required to report apparent CSAM, and
        apparent online enticement or child sex trafficking, to the National Center for Missing &amp;
        Exploited Children&apos;s CyberTipline as soon as we become aware of it, and to preserve related
        records as described in Section 6. We will also cooperate with law enforcement investigations
        related to such reports. This scanning and reporting obligation applies regardless of any other
        privacy setting or preference.
      </p>

      <h2>10. Security</h2>
      <p>
        We use industry-standard security measures, including encryption in transit, to protect your
        information. We offer two-factor authentication for Pastor accounts, and encourage all users
        to enable it. No system is completely secure, and we cannot guarantee absolute security of
        your information.
      </p>

      <h2>11. International Data Transfers</h2>
      <p>
        [Placeholder — if GospelGoLive serves users outside the United States, this section needs to
        address the legal basis for cross-border data transfer, particularly given recent changes to
        EU data protection frameworks. Recommend explicit legal review before marketing to or
        accepting users from the EU/UK.]
      </p>

      <h2>12. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. If we make material changes, we will
        notify you by email and update the &quot;Last updated&quot; date above. Continued use of the Service
        after changes take effect constitutes acceptance of the revised policy.
      </p>

      <h2>13. Contact Us</h2>
      <p>
        Questions about this Privacy Policy can be directed to [privacy@gospelgolive.com] or [MAILING
        ADDRESS].
      </p>
    </LegalDoc>
  );
}
