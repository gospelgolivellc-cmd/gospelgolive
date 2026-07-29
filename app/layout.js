import Script from 'next/script';

export const metadata = {
  title: "GospelGoLive — Something's Coming",
  description: 'A new home for live worship, sermons on demand, and giving — for pastors and the people who follow them.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700;9..144,800&family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <Script src="/posthog-init.js" strategy="afterInteractive" />
        <Script src="/cookie-consent.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
