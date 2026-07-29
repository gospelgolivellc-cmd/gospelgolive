/** @type {import('next').NextConfig} */
const nextConfig = {
  // ffmpeg-static resolves its binary path relative to its own __dirname at
  // runtime — letting webpack bundle it into .next/server rewrites that path
  // and breaks it (spawn ENOENT). Keep it external so it's just require()'d
  // straight from node_modules instead. geoip-lite has the same issue with
  // its bundled .dat data files (ENOENT on geoip-country.dat).
  serverExternalPackages: ['ffmpeg-static', 'geoip-lite'],

  // serverExternalPackages above stops webpack from mangling geoip-lite's
  // paths, but it's a separate problem from Vercel's own file-tracing step,
  // which decides which node_modules files actually get copied into each
  // deployed serverless function. geoip-lite loads its .dat files with a
  // dynamically-built path the tracer doesn't follow, so without this it
  // silently omits them — any route that imports lib/geo.js (directly, or
  // transitively through lib/terms.js) throws ENOENT at module-load time in
  // production despite working fine in local dev, where the full
  // node_modules tree is just sitting on disk regardless of tracing.
  outputFileTracingIncludes: {
    '/api/**': ['./node_modules/geoip-lite/data/**'],
  },

  // Drops the `X-Powered-By: Next.js` response header (minor recon info leak).
  poweredByHeader: false,

  // The root domain now serves the real app (public/mockup.html) instead of
  // the "Something's Coming" placeholder in app/page.js — beforeFiles is
  // required here specifically because app/page.js still exists and would
  // otherwise win the match for "/" before this rewrite ever gets a chance
  // to run. The placeholder page itself is left in place, just unreachable
  // at "/", rather than deleted, in case there's ever a reason to go back to
  // a coming-soon state.
  async rewrites() {
    return {
      beforeFiles: [{ source: '/', destination: '/mockup.html' }],
      afterFiles: [],
      fallback: [],
    };
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Blocks the site from being framed anywhere — the app has no
          // legitimate embed use case, so this fully replaces the older
          // X-Frame-Options mechanism (kept below too for older browsers).
          //
          // script-src/style-src are intentionally left unset here rather
          // than tightened to 'self': the current pages rely on inline
          // <script> blocks, inline onclick="" handlers, and inline
          // style="" attributes throughout, so a strict CSP would break the
          // app outright. Locking those down needs a follow-up pass (nonces
          // or moving inline script/style out to files) — this policy only
          // adds the directives that are safe to enable without that work.
          //
          // form-action is scoped to also allow Stripe's own domains:
          // Stripe Connect's embedded onboarding component (mounted in the
          // payout wizard) submits through Stripe-hosted endpoints as part
          // of its internal identity/bank verification flow — restricting
          // form-action to 'self' silently broke that with a generic
          // "error occurred while authenticating your account" (confirmed
          // by testing with/without this exception).
          {
            key: 'Content-Security-Policy',
            value: [
              "frame-ancestors 'none'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self' https://connect-js.stripe.com https://js.stripe.com https://hooks.stripe.com",
            ].join('; '),
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            // camera/microphone stay enabled for the in-browser live
            // broadcast feature (getUserMedia in the pastor dashboard).
            key: 'Permissions-Policy',
            value: 'geolocation=(), usb=(), magnetometer=(), gyroscope=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
