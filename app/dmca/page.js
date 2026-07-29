import LegalDoc from '../_legal/LegalDoc';

export const metadata = {
  title: 'DMCA Copyright Policy — GospelGoLive.com',
  description: 'DMCA Copyright Policy for GospelGoLive.com',
};

export default function DmcaPage() {
  return (
    <LegalDoc title="GospelGoLive.com — DMCA Copyright Policy" effectiveDate="July 26, 2026" lastUpdated="July 26, 2026">
      <p>
        GospelGoLive respects the intellectual property rights of others and expects users of our
        Service to do the same. This policy explains how to report claimed copyright infringement and
        how we respond, in accordance with the Digital Millennium Copyright Act (DMCA), 17 U.S.C. § 512.
      </p>

      <h2>1. Filing a Takedown Notice</h2>
      <p>
        If you believe content on GospelGoLive infringes your copyright, send a written notice to our
        designated agent (contact information below) that includes <strong>all</strong> of the
        following. Under the DMCA, a notice missing any of these elements may not be legally effective,
        and we may be unable to act on it until it&apos;s corrected:
      </p>
      <ul>
        <li>A physical or electronic signature of the copyright owner or a person authorized to act on their behalf.</li>
        <li>Identification of the copyrighted work you claim has been infringed — or, if multiple works are covered by one notice, a representative list.</li>
        <li>Identification of the specific material you claim is infringing, with enough detail for us to locate it (for example, the direct URL of the sermon, stream, or page).</li>
        <li>Your contact information, including your name, mailing address, telephone number, and email address.</li>
        <li>A statement that you have a good faith belief that the use of the material is not authorized by the copyright owner, its agent, or the law.</li>
        <li>A statement, made under penalty of perjury, that the information in your notice is accurate and that you are authorized to act on behalf of the copyright owner.</li>
      </ul>
      <div className="callout">
        <strong>Send notices to:</strong>
        <p style={{ margin: '10px 0 0' }}>
          [Designated Agent Name / Title]<br />
          GospelGoLive — Copyright Agent<br />
          [Street Address — no P.O. Boxes]<br />
          [City, State, ZIP]<br />
          Email: [dmca@gospelgolive.com]<br />
          Phone: [PHONE NUMBER]
        </p>
      </div>
      <p>
        [Placeholder — the designated agent contact information above must be replaced with real,
        verified details, and registered with the U.S. Copyright Office, before this policy is
        published or relied upon. An incomplete or inaccurate registration can invalidate safe harbor
        protection entirely.]
      </p>

      <h2>2. What Happens After We Receive a Valid Notice</h2>
      <p>Upon receiving a complete and valid notice, we will:</p>
      <ul>
        <li>Remove or disable access to the identified material expeditiously.</li>
        <li>Notify the account holder who posted the material, including a copy of the complaint.</li>
        <li>Document the notice against that account for purposes of our repeat infringer policy (Section 5).</li>
      </ul>
      <p>
        If a notice is missing required information, we may reach out to the sender for clarification
        before taking action, as permitted under the DMCA.
      </p>

      <h2>3. Counter-Notification</h2>
      <p>
        If your content was removed and you believe this was a mistake or misidentification, you may
        submit a counter-notice to the same designated agent above, including:
      </p>
      <ul>
        <li>Your physical or electronic signature.</li>
        <li>Identification of the material that was removed and its location on the Service before removal.</li>
        <li>A statement, made under penalty of perjury, that you have a good faith belief the material was removed as a result of mistake or misidentification.</li>
        <li>
          Your name, address, and telephone number, and a statement that you consent to the
          jurisdiction of the federal court in your district (or, if outside the United States, any
          district in which GospelGoLive may be found), and that you will accept service of process
          from the person who filed the original notice.
        </li>
      </ul>
      <p>
        Upon receiving a valid counter-notice, we will forward it to the original complaining party.
        Unless that party notifies us that they&apos;ve filed a lawsuit seeking a court order restraining
        you from continuing the allegedly infringing activity, we will restore the material within{' '}
        <strong>10 to 14 business days</strong> of receiving the counter-notice, as required by the
        DMCA.
      </p>

      <h2>4. Misrepresentation</h2>
      <p>
        The DMCA imposes liability on anyone who knowingly and materially misrepresents that material
        is infringing, or that it was removed by mistake. Before filing a notice or counter-notice,
        make sure the claim is accurate — you may be liable for damages, including costs and attorneys&apos;
        fees, if you misrepresent the facts.
      </p>

      <h2>5. Repeat Infringer Policy</h2>
      <p>
        Accounts that receive multiple valid, uncontested takedown notices will be subject to
        escalating enforcement, up to and including permanent termination, consistent with our broader
        content moderation practices described in our Terms of Service. [Placeholder — the specific
        threshold currently implemented is three valid, uncontested notices within a 12-month period;
        this must be reviewed and formally set with counsel before publication.] A notice that&apos;s
        successfully counter-noticed under Section 3 no longer counts toward this threshold, since it&apos;s
        no longer uncontested.
      </p>

      <h2>6. A Note for Pastors on Worship Music</h2>
      <p>
        Many services include copyrighted worship music, hymns, or other licensed material. GospelGoLive
        is a hosting platform, not a source of music licensing —{' '}
        <strong>you are responsible for ensuring you have appropriate rights or licensing</strong>{' '}
        (such as a CCLI Streaming License or equivalent) for any copyrighted music used in your
        services, independent of and in addition to your use of this Service.
      </p>

      <h2>7. Contact</h2>
      <p>
        Questions about this policy that are not a formal DMCA notice or counter-notice can be directed
        to [legal@gospelgolive.com].
      </p>
    </LegalDoc>
  );
}
