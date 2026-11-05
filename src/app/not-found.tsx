import Link from 'next/link';
import { Logo } from '@/components/brand';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <Logo className="h-8 w-auto" />
      <h1 className="mt-4 text-[1.75rem]">This page isn&apos;t on the map</h1>
      <p className="text-soft">The link may be old, or the page may have moved.</p>
      <Link href="/" className="btn btn-primary">Go to Today</Link>
    </main>
  );
}
