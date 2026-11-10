'use client';
import { Logo } from '@/components/brand';
import { LoadError } from '@/components/LoadError';

// The signed-in layout reads the database itself, and a boundary can't catch its own
// layout. So when the database is down, this is the screen people get.
export default function RootError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="glass sticky top-0 border-b border-line">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6"><Logo size={28} /></div>
      </header>
      <main id="main" className="flex-1 pt-6"><LoadError retry={retry} /></main>
    </div>
  );
}
