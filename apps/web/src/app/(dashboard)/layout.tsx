'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/lib/auth';
import { SocketProvider } from '@/lib/socket';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'needs-setup') router.replace('/setup');
    else if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status !== 'authenticated') {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>;
  }
  return (
    <SocketProvider>
      <AppShell>{children}</AppShell>
    </SocketProvider>
  );
}
