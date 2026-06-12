import type { Metadata } from 'next';
import { Source_Serif_4, Spline_Sans, Spline_Sans_Mono } from 'next/font/google';
import './globals.css';

const splineSans = Spline_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap'
});

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap'
});

const splineMono = Spline_Sans_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap'
});

export const metadata: Metadata = {
  title: 'FF Compliance',
  description: 'Maritime compliance workflow software for fishing companies.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${splineSans.variable} ${sourceSerif.variable} ${splineMono.variable}`}>{children}</body>
    </html>
  );
}
