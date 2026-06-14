'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';

export default function Home() {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'needs-setup') router.replace('/setup');
    else if (status === 'unauthenticated') router.replace('/login');
    else if (status === 'authenticated') router.replace('/monitors');
  }, [status, router]);

  return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>;
}
