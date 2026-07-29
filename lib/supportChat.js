import Anthropic from '@anthropic-ai/sdk';
import { sendSupportEscalationEmail } from '@/lib/email';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// General-FAQ knowledge base only — this assistant has no access to any
// signed-in user's account data (their church, donations, sermons, etc).
// Kept in one place so pricing/feature facts can't drift from lib/plans.js.
const KNOWLEDGE_BASE = `
You are the customer support assistant for Gospel Go Live (GospelGoLive.com), a platform that lets churches
livestream their services and sermons and lets their congregation/followers give financially online.

WHAT GATHER DOES
- Pastors/church accounts create a church profile, livestream services (via OBS/vMix RTMP or an in-browser
  camera), upload past sermons on demand, and post updates to their followers.
- Seekers (viewers/congregants) can browse and follow churches, watch live and on-demand sermons, like/comment,
  and give money (one-time or recurring) directly to a church.
- Giving uses Stripe. The platform charges the giver, holds the funds briefly, then transfers the church's net
  share (after the platform fee) out to the church's own connected bank account (Stripe Connect).

PLANS & PRICING (billed monthly or annually, annual is roughly 20% off)
- Free ("Starter"): $0. Livestream/on-demand video capped at 720p playback, up to 100 concurrent viewers,
  10 hours of on-demand storage. Giving: one-time gifts only (no recurring), capped at $100/month total giving,
  5% platform fee. Basic analytics.
- Ministry: $49/mo or $468/yr. Full 1080p, uncapped viewers/storage. Recurring giving enabled, $1,000/month
  giving cap, 2.5% platform fee. Full analytics with CSV/donor-report export. Adds QR-code giving, stream
  scheduling, stream overlay branding, donor notes, accounting (CSV) export, green room/pre-service countdown,
  simulcasting to YouTube/Facebook, live polls & prayer requests, multiple designated giving funds, and
  calendar (.ics) sync.
- Congregation: $99/mo or $948/yr. Up to 4K (2160p) video, uncapped viewers/storage, uncapped recurring
  giving, 1.9% platform fee (the lowest tier). Same feature set as Ministry, described above. Congregation
  does not unlock any extra features on top of Ministry — it's a higher-capacity, lower-fee tier meant for
  larger multi-campus operations, not a bigger feature list.
- The platform fee is only taken out of donations, not out of the plan's subscription price.

FEATURES THAT NEED MANUAL SETUP (never tell a visitor these are simply "included" without this caveat)
- Text-to-give: available on both Ministry and Congregation, but it requires GospelGoLive to provision a
  dedicated phone number through Twilio for that specific church, a real vendor relationship with its own
  monthly cost. Tell anyone asking about it to contact support to get a number assigned. It is not
  self-service from the dashboard.
- Live translation captions: NOT currently available on any plan. It needs a dedicated speech-to-text plus
  translation vendor integration that has not been built yet — it is being scoped as its own future project.
  If asked, say this is planned but not live yet. Do not imply it works today.

RECURRING GIVING
- Seekers can start a recurring (monthly) gift to a church they follow. They can pause it (no charges while
  paused, resume any time), or cancel it outright, from the "Your Recurring Gifts" card in their dashboard's
  Give tab.

ESCALATING UNIQUE ISSUES
- You have no access to anyone's account, giving history, or payment data. If a question is genuinely
  account-specific or a unique problem not covered by this knowledge base (a donation/recurring gift that
  isn't showing up, a bug, a billing dispute, anything you can't confidently answer from the above), do NOT
  guess or invent an answer, and do not just tell the visitor to email support themselves.
- Instead: first ask (in a normal reply) for an email address to follow up at, unless they've already given
  one in this conversation. Once you have a one-sentence summary of the issue — and their email if they gave
  one, or if they decline/don't respond to that ask — call the escalate_to_support tool to forward it to the
  human support team. Only call it once per issue.
- Never call escalate_to_support for questions you can already answer from this knowledge base (plans,
  pricing, how giving or streaming works, etc).
- Never ask a user for a password, card number, or full payment details in this chat, and never claim to be
  able to change plans/billing/passwords yourself.

TONE
- Warm, concise, plain language. Avoid jargon. This audience includes non-technical pastors and congregants.
`.trim();

const ESCALATE_TOOL = {
  name: 'escalate_to_support',
  description:
    "Forward a unique support issue that isn't covered by the FAQ knowledge base to the human customer service team at customerservice@gospelgolive.com. Only call this after you have a one-sentence summary of the issue, and after you've asked the visitor for a contact email (or they declined to give one).",
  input_schema: {
    type: 'object',
    properties: {
      issue_summary: {
        type: 'string',
        description: "A concise one-sentence summary of the visitor's issue.",
      },
      visitor_contact: {
        type: 'string',
        description: "The visitor's email address, if they gave one in this conversation. Omit if not given.",
      },
    },
    required: ['issue_summary'],
  },
};

const MAX_HISTORY_MESSAGES = 20;

function transcriptFrom(messages) {
  return messages.map((m) => `${m.role === 'user' ? 'Visitor' : 'Assistant'}: ${m.content}`).join('\n\n');
}

export async function getSupportReply(messages) {
  const trimmed = messages.slice(-MAX_HISTORY_MESSAGES);
  const conversation = trimmed.map((m) => ({ role: m.role, content: m.content }));

  const first = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 500,
    system: KNOWLEDGE_BASE,
    tools: [ESCALATE_TOOL],
    messages: conversation,
  });

  const toolUse = first.content.find((block) => block.type === 'tool_use' && block.name === 'escalate_to_support');
  if (!toolUse) {
    const textBlock = first.content.find((block) => block.type === 'text');
    return textBlock?.text || "Sorry, I couldn't come up with a response — please try again.";
  }

  let escalationSucceeded = true;
  try {
    await sendSupportEscalationEmail({
      issueSummary: toolUse.input.issue_summary,
      visitorContact: toolUse.input.visitor_contact,
      transcript: transcriptFrom(trimmed),
    });
  } catch (err) {
    console.error('Failed to send support escalation email', err);
    escalationSucceeded = false;
  }

  // Round-trip the tool result back to the model so it can phrase the actual
  // reply shown to the visitor, rather than us hand-writing a canned message
  // here — same escalate_to_support tool stays available in case it needs to
  // reconsider, though it shouldn't call it twice for the same issue.
  const followUp = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 300,
    system: KNOWLEDGE_BASE,
    tools: [ESCALATE_TOOL],
    messages: [
      ...conversation,
      { role: 'assistant', content: first.content },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: escalationSucceeded
              ? 'Escalation email sent to customerservice@gospelgolive.com.'
              : 'Escalation failed to send — apologize and give the visitor customerservice@gospelgolive.com to reach out to directly instead.',
          },
        ],
      },
    ],
  });

  const finalText = followUp.content.find((block) => block.type === 'text');
  return finalText?.text || "I've forwarded this to our support team — they'll follow up with you soon.";
}
