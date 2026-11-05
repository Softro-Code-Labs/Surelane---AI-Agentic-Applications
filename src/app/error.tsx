'use client';
import { Logo } from '@/components/brand';
import { LoadError } from '@/components/LoadError';

// The signed-in layout reads the database itself, and a boundary can't catch its own
// layout. So when the database is down, this is the screen people get.
export default function RootError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="band">
        <div className="mx-auto flex h-[60px] max-w-3xl items-center px-4 sm:px-6"><Logo className="h-[24px] w-auto sm:h-7" /></div>
      </header>
      <main id="main" className="flex-1"><LoadError retry={retry} /></main>
    </div>
  );
}
