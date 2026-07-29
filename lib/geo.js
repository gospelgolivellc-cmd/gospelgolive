import geoip from 'geoip-lite';

export function extractClientIp(req) {
  const forwardedFor = req.headers.get('x-forwarded-for');
  return forwardedFor ? forwardedFor.split(',')[0].trim() : null;
}

// geoip-lite's lookup() also returns city/region/ll (lat,lng) alongside
// country — this just stops discarding them. Returns `state` (not `region`)
// to match the city/state/country shape used everywhere else in this app
// (User/Church columns, parseLocationInput) — callers should never need to
// know geoip-lite's own field naming.
export function lookupIpLocation(ip) {
  if (!ip) return { city: null, state: null, country: null };
  try {
    const result = geoip.lookup(ip);
    if (!result) return { city: null, state: null, country: null };
    return {
      city: result.city || null,
      state: result.region || null,
      country: result.country || null,
    };
  } catch {
    return { city: null, state: null, country: null };
  }
}

// Best-effort normalization so a self-reported "Illinois" and an
// IP-resolved "IL" still tier-match in the recommendation algorithm. Not
// validation — unrecognized input just passes through trimmed/uppercased.
const US_STATE_ABBR = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO',
  montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH',
  oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
  'district of columbia': 'DC',
};

export function normalizeState(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const abbr = US_STATE_ABBR[trimmed.toLowerCase()];
  if (abbr) return abbr;
  return trimmed.length <= 3 ? trimmed.toUpperCase() : trimmed;
}

// Splits a single free-text "City, State" field on the last comma. Handles
// a bare city with no comma at all.
export function parseLocationInput(raw) {
  if (!raw) return { city: null, state: null };
  const trimmed = raw.trim();
  if (!trimmed) return { city: null, state: null };
  const lastComma = trimmed.lastIndexOf(',');
  if (lastComma === -1) return { city: trimmed, state: null };
  const city = trimmed.slice(0, lastComma).trim() || null;
  const state = normalizeState(trimmed.slice(lastComma + 1));
  return { city, state };
}
