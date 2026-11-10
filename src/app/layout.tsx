import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Surelane', template: '%s | Surelane' },
  description: 'Your clear, safe lane to real jobs. Surelane finds open vacancies that match your CV.',
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover',
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#f6f7fb' }, { media: '(prefers-color-scheme: dark)', color: '#0a0c14' }],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = (await cookies()).get('theme')?.value;
  return <html lang="en" data-theme={theme === 'light' || theme === 'dark' ? theme : undefined}><body>{children}</body></html>;
}
