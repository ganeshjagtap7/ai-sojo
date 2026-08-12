import type { Metadata } from 'next';
import { Inter, Spectral, JetBrains_Mono, Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';
import './globals.css';
import './flow.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
});

const spectral = Spectral({
  variable: '--font-spectral',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
});

// Sojo workspace fonts — used inside /app/*. Loaded globally so client
// components don't need to know about font wiring.
const geist = Geist({
  variable: '--font-geist',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
});

const instrumentSerif = Instrument_Serif({
  variable: '--font-instrument',
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
});

const SITE_URL = 'https://ai-sojo.vercel.app';
const TITLE = 'Searcher — A thesis in five minutes';
const DESCRIPTION =
  'An investment committee that thinks in targets, not decks. Describe an acquisition mandate; get a working thesis and a ranked board of real businesses.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: 'Searcher',
  // So the link looks legitimate when shared (Slack, iMessage, X, etc.).
  openGraph: {
    type: 'website',
    siteName: 'Searcher',
    url: '/',
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${spectral.variable} ${jetbrainsMono.variable} ${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
