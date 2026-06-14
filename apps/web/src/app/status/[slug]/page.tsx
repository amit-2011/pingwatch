'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import type { MonitorStatus, PublicIncident, PublicStatusPage } from '@/lib/api';

const OVERALL: Record<PublicStatusPage['overall'], { label: string; dot: string; text: string }> = {
  operational: { label: 'All systems operational', dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  degraded: { label: 'Partial degradation', dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  down: { label: 'Major outage', dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
};

const ITEM: Record<MonitorStatus, { label: string; dot: string }> = {
  up: { label: 'Operational', dot: 'bg-emerald-500' },
  down: { label: 'Down', dot: 'bg-red-500' },
  pending: { label: 'Pending', dot: 'bg-slate-400' },
  paused: { label: 'Paused', dot: 'bg-slate-400' },
  maintenance: { label: 'Maintenance', dot: 'bg-amber-500' },
};

function uptimeLabel(value: number | null): string {
  return value == null ? '—' : `${value.toFixed(2)}%`;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function IncidentsSection({ incidents }: { incidents: PublicIncident[] }) {
  if (incidents.length === 0) return null;
  return (
    <div className="mb-8 space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Active incidents</h2>
      {incidents.map((inc, i) => (
        <div
          key={i}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">{inc.title}</span>
            <span className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs font-medium capitalize text-slate-500 dark:border-slate-700">
              {inc.resolvedAt ? 'resolved' : inc.severity}
            </span>
          </div>
          <ol className="mt-3 space-y-2 border-l border-slate-200 pl-4 dark:border-slate-800">
            {inc.updates.length > 0 ? (
              inc.updates
                .slice()
                .reverse()
                .map((u, j) => (
                  <li key={j} className="relative">
                    <span className="absolute -left-[1.3rem] top-1.5 h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                    <p className="text-sm text-slate-600 dark:text-slate-300">{u.message}</p>
                    <span className="text-xs text-slate-400">{fmt(u.createdAt)}</span>
                  </li>
                ))
            ) : (
              <li className="text-sm text-slate-500">Started {fmt(inc.startedAt)}</li>
            )}
          </ol>
        </div>
      ))}
    </div>
  );
}

async function fetchPublic(slug: string): Promise<PublicStatusPage> {
  const res = await fetch(`/api/public/status/${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as PublicStatusPage;
}

export default function PublicStatusPageView() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-status', slug],
    queryFn: () => fetchPublic(slug),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500 dark:bg-slate-950">
        Loading…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-slate-50 dark:bg-slate-950">
        <h1 className="text-2xl font-bold">Status page not found</h1>
        <p className="text-sm text-slate-500">This page may be unpublished or the link is incorrect.</p>
      </div>
    );
  }

  const overall = OVERALL[data.overall];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold">{data.title}</h1>
          {data.description && <p className="mt-2 text-slate-500">{data.description}</p>}
        </header>

        <div className="mb-8 flex items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white py-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className={`h-3 w-3 rounded-full ${overall.dot}`} />
          <span className={`text-lg font-semibold ${overall.text}`}>{overall.label}</span>
        </div>

        <IncidentsSection incidents={data.incidents} />

        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {data.items.length > 0 ? (
            data.items.map((item, i) => {
              const s = ITEM[item.status];
              return (
                <div key={i} className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-2.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
                    <span className="font-medium">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <span className="hidden text-slate-400 sm:inline">
                      30d {uptimeLabel(item.uptime30d)}
                    </span>
                    <span className="w-24 text-right text-slate-500">{s.label}</span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="px-5 py-12 text-center text-slate-500">No services listed.</div>
          )}
        </div>

        <footer className="mt-8 text-center text-xs text-slate-400">
          Powered by <span className="font-medium text-slate-500">PingWatch</span>
        </footer>
      </div>
    </div>
  );
}
