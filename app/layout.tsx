import type { Metadata } from 'next';
import { Inter, Spectral, JetBrains_Mono } from 'next/font/google';
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

export const metadata: Metadata = {
  title: 'Searcher — A thesis in four minutes',
  description: 'An investment committee that thinks in targets, not decks.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${spectral.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
