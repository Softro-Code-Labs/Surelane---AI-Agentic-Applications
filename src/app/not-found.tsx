import { ArrowLeft, Compass } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/brand';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">
      <Logo size={32} />
      <div className="card mt-10 w-full max-w-md p-8">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-info-soft text-primary"><Compass size={26} aria-hidden="true" /></span>
        <p className="eyebrow mt-5">Error 404</p>
        <h1 className="mt-1 text-[1.6rem]">This page isn&apos;t on the map</h1>
        <p className="mt-2 text-sm text-soft">The link may be old, or the page may have moved.</p>
        <Link href="/" className="btn btn-primary mt-6"><ArrowLeft size={16} aria-hidden="true" />Go to Today</Link>
      </div>
    </main>
  );
}
