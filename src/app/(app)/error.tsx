'use client';
import { LoadError } from '@/components/LoadError';

// A page failed inside the app, so the header and navigation stay in place.
export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return <LoadError retry={retry} />;
}
