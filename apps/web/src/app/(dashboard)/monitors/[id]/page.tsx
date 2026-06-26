'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { MonitorDetail } from '@/components/monitor-detail';

export default function MonitorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      <Link
        href="/monitors"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-700 dark:hover:text-slate-300"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Monitors
      </Link>
      <MonitorDetail id={id} onDeleted={() => router.push('/monitors')} />
    </div>
  );
}
