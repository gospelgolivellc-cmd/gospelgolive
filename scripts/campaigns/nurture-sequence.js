// Content for the 10-week "Coming Soon Waitlist" nurture sequence.
// Only weeks 1-6 have copy so far — add week 7-10 objects here (same shape)
// once that copy exists, then re-run scripts/create-nurture-sequence.js.
//
// `bodyHtml` is the only field you'd normally touch — plain <p>/<ul> markup,
// no need to worry about the header/footer/unsubscribe wrapper, that's
// applied automatically. Keep edits here (not in the Resend dashboard) if
// you want to be able to re-run the script later and have it stay in sync —
// dashboard edits get overwritten the next time the script runs for that week.
module.exports = [
  {
    week: 1,
    name: 'Nurture — Week 1 — Welcome',
    subject: "You're in — welcome to GospelGoLive",
    previewText: "Here's what to expect while we build this thing.",
    bodyHtml: `
      <p>Hey there,</p>
      <p>Thanks for signing up — you're officially one of the first people to know when GospelGoLive goes live.</p>
      <p>Here's the short version of what we're building: a home for live worship, sermons on demand, and giving — one place for pastors to reach their congregation online, and for anyone looking for a church home to find one.</p>
      <p>Over the next few weeks, I'll send you a short email each week — a look at a feature, a bit of the story behind why we're building this, and eventually, your invite to get in early.</p>
      <p>No spam, no daily emails. Just Sundays, one email, worth opening.</p>
      <p>Talk soon,<br>The GospelGoLive Team</p>
    `,
  },
  {
    week: 2,
    name: 'Nurture — Week 2 — Why we built this',
    subject: 'Why we built GospelGoLive',
    previewText: 'It started with a shut-in church member and a bad livestream setup.',
    bodyHtml: `
      <p>Most churches already stream their services somewhere — Facebook, YouTube, a scattered Vimeo link in a weekly email. It works, technically. But it means:</p>
      <ul>
        <li>Pastors juggle three different tools to stream, host sermons, and collect giving</li>
        <li>Members who can't make it in person have to go hunting across platforms to find "their" church</li>
        <li>There's no single place to actually grow an online congregation — just scattered views</li>
      </ul>
      <p>We built GospelGoLive to be the one place all of that lives — for the pastor building an online ministry, and for the person looking for a church that feels like home, wherever they are.</p>
      <p>More on how it actually works next week.</p>
    `,
  },
  {
    week: 3,
    name: 'Nurture — Week 3 — Go live in minutes',
    subject: 'Go live in under 5 minutes',
    previewText: 'No production team required.',
    bodyHtml: `
      <p>One of the things we're proudest of: a pastor can go from "let's stream this" to actually live in about five minutes. No production team, no complicated software — just a title, a description, and one button.</p>
      <p>While you're live, you'll see your viewer count climb in real time, follow along with comments from your congregation, and know that the second the service ends, it's automatically saved to your sermon library — no extra upload step.</p>
      <p>Next week: what happens to that sermon after the stream ends.</p>
    `,
  },
  {
    week: 4,
    name: 'Nurture — Week 4 — Sermon library',
    subject: 'Never lose a sermon in a hard drive again',
    previewText: 'Every message you’ve ever given, searchable in one place.',
    bodyHtml: `
      <p>Every stream becomes part of a searchable, browsable library — organized by series, topic, and date, so a visitor can find exactly the message they need, whether that's last Sunday's sermon or something from two years ago.</p>
      <p>For sermon seekers, it means being able to search "hope" or "grief" or "finding purpose" and actually find something that speaks to where they are right now — not just whatever a church happened to post that week.</p>
    `,
  },
  {
    week: 5,
    name: 'Nurture — Week 5 — Giving',
    subject: "Giving that doesn't feel like an afterthought",
    previewText: "Here's exactly how the money works.",
    bodyHtml: `
      <p>We wanted giving to feel as natural as passing the plate — not a clunky redirect to a third-party form.</p>
      <p>Here's the honest breakdown of how it works:</p>
      <ul>
        <li><strong>If you're giving:</strong> 100% of your gift goes to the church. We don't add a fee on your end, ever.</li>
        <li><strong>If you're a pastor receiving gifts:</strong> there's a small, transparent processing fee — the same kind any payment processor charges — and it's the only way we keep the platform running without charging seekers a cent.</li>
      </ul>
      <p>Every gift is tracked in real time, with a full giving history for donors and a clear ledger for pastors. No mystery fees, no guessing where the money went.</p>
    `,
  },
  {
    week: 6,
    name: 'Nurture — Week 6 — Behind the scenes',
    subject: 'An update from the team building GospelGoLive',
    previewText: "What we've built so far, and what's left.",
    bodyHtml: `
      <p>Wanted to give you an honest look behind the curtain.</p>
      <p>Right now, the platform can stream live services, host on-demand sermons, and process giving end-to-end. We're in the middle of building out the analytics dashboard pastors will use to see how their sermons are performing.</p>
      <p>We're aiming for a <strong>[LAUNCH MONTH]</strong> launch — you'll be the first to know the exact date, and you'll get early access before it's open to everyone else.</p>
      <p>Thanks for being patient with us while we get this right.</p>
    `,
  },
];
