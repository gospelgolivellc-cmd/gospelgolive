// Thin SMS-sending wrapper for phone-number two-factor auth. Until enough
// Twilio env vars are set, this stays in "stub mode": the code is logged
// server-side and also handed back to the caller so the UI can show a
// dev-mode banner instead of a real text message.
//
// Two auth styles are supported, matching Twilio's own two options:
//   - Account SID + Auth Token: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
//   - API Key SID + Secret (scoped, revocable credential — Twilio's
//     recommended style): TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID,
//     TWILIO_API_KEY_SECRET. Twilio's API Key auth still requires the
//     Account SID alongside the key/secret pair.
// Either style also needs TWILIO_FROM_NUMBER. API Key auth is tried first
// if both are present.
export async function sendSmsCode(phoneNumber, code) {
  const {
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_API_KEY_SID,
    TWILIO_API_KEY_SECRET,
    TWILIO_FROM_NUMBER,
  } = process.env;

  const hasApiKeyAuth = Boolean(TWILIO_ACCOUNT_SID && TWILIO_API_KEY_SID && TWILIO_API_KEY_SECRET);
  const hasAuthTokenAuth = Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN);
  const configured = Boolean((hasApiKeyAuth || hasAuthTokenAuth) && TWILIO_FROM_NUMBER);

  if (!configured) {
    console.log(`[SMS STUB] Would text ${phoneNumber}: Your GospelGoLive code is ${code}`);
    return { sent: false, stub: true };
  }

  let twilioModule;
  try {
    twilioModule = await import('twilio');
  } catch {
    throw new Error(
      'Twilio credentials are set but the twilio package is not installed. Run `npm install twilio`.'
    );
  }

  const client = hasApiKeyAuth
    ? twilioModule.default(TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, { accountSid: TWILIO_ACCOUNT_SID })
    : twilioModule.default(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

  await client.messages.create({
    to: phoneNumber,
    from: TWILIO_FROM_NUMBER,
    body: `Your GospelGoLive code is ${code}`,
  });
  return { sent: true, stub: false };
}
