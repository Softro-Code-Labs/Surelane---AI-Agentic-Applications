export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthScreen } from '@/components/Auth';
import { AuthForm } from '@/components/Forms';
import { ownerExists } from '@/lib/auth';

export const metadata: Metadata = { title: 'Create your account' };

export default async function Setup() {
  if (await ownerExists()) redirect('/login');
  return <AuthScreen title="Create your account" intro="This app has one owner. Once you create this account, sign-ups close."><AuthForm mode="setup" needsCode={Boolean(process.env.SETUP_CODE)} /></AuthScreen>;
}
