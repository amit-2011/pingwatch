'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type MonitorView, apiFetch } from '@/lib/api';
import { MonitorForm } from '@/components/monitor-form';

export default function EditMonitorPage() {
  const { id } = useParams<{ id: string }>();
  const { data: monitor } = useQuery({
    queryKey: ['monitor', id],
    queryFn: () => apiFetch<MonitorView>(`/monitors/${id}`),
  });

  return (
    <div className="mx-auto max-w-2xl p-8">
      <Link href={`/monitors/${id}`} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>
      <h1 className="mb-6 text-2xl font-bold">Edit monitor</h1>
      {monitor ? <MonitorForm monitor={monitor} /> : <div className="text-slate-500">Loading…</div>}
    </div>
  );
}
