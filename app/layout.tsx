import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FF Compliance',
  description: 'Maritime compliance workflow software for fishing companies.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
