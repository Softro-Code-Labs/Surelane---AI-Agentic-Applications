export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthScreen } from '@/components/Auth';
import { AuthForm } from '@/components/Forms';
import { isSignedIn, ownerExists } from '@/lib/auth';

export const metadata: Metadata = { title: 'Sign in' };

export default async function Login() {
  if (!(await ownerExists())) redirect('/setup');
  if (await isSignedIn()) redirect('/');
  return <AuthScreen title="Sign in" intro="Your job search is waiting."><AuthForm mode="login" /></AuthScreen>;
}
