'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { MonitorForm } from '@/components/monitor-form';

export default function NewMonitorPage() {
  return (
    <div className="mx-auto max-w-2xl p-8">
      <Link href="/monitors" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" />
        Monitors
      </Link>
      <h1 className="mb-6 text-2xl font-bold">Add monitor</h1>
      <MonitorForm />
    </div>
  );
}
