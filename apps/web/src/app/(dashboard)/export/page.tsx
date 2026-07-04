'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, FileJson, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { type CheckRow, type MonitorView, apiFetch } from '@/lib/api';
import { Button, Card, Label } from '@/components/ui';
import { fullTime, responseLabel } from '@/lib/format';
import { beatMeta } from '@/lib/status';
import { cn } from '@/lib/utils';

const SELECT_CLASS =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-signal/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

/** Server caps a single export query at this many rows (keep in sync with CHECKS_EXPORT_MAX). */
const ROW_CAP = 5000;

/** Format a Date as the value an <input type="datetime-local"> expects (local time, no zone). */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** CSV-escape a cell: wrap in quotes and double any embedded quote when it contains , " or newline. */
function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadFile(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const COLUMNS = ['Time', 'Monitor', 'Status', 'Response', 'Code', 'Message'] as const;

export default function ExportPage() {
  const now = useMemo(() => new Date(), []);
  const [monitorId, setMonitorId] = useState('all');
  const [from, setFrom] = useState(toLocalInput(new Date(now.getTime() - 24 * 60 * 60 * 1000)));
  const [to, setTo] = useState(toLocalInput(now));

  const { data: monitors } = useQuery({
    queryKey: ['monitors'],
    queryFn: () => apiFetch<MonitorView[]>('/monitors'),
  });

  const fromISO = from ? new Date(from).toISOString() : '';
  const toISO = to ? new Date(to).toISOString() : '';

  const {
    data: rows,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['checks', monitorId, fromISO, toISO],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (monitorId !== 'all') qs.set('monitorId', monitorId);
      if (fromISO) qs.set('from', fromISO);
      if (toISO) qs.set('to', toISO);
      return apiFetch<CheckRow[]>(`/checks?${qs.toString()}`);
    },
  });

  const data = rows ?? [];
  const capped = data.length >= ROW_CAP;
  const monitorLabel = monitorId === 'all' ? 'all-monitors' : (monitors?.find((m) => m.id === monitorId)?.name ?? 'monitor');
  const stamp = toLocalInput(new Date()).replace(/[:T]/g, '-');
  const baseName = `pingwatch-checks_${monitorLabel.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}_${stamp}`;

  function exportCsv() {
    const header = ['Time (ISO)', 'Monitor', 'Status', 'Response (ms)', 'Status code', 'Message', 'Important'];
    const lines = data.map((r) =>
      [
        r.createdAt,
        r.monitorName,
        beatMeta(r.status).label,
        r.responseTime ?? '',
        r.statusCode ?? '',
        r.message ?? '',
        r.important ? 'yes' : 'no',
      ]
        .map(csvCell)
        .join(','),
    );
    downloadFile(`${baseName}.csv`, [header.join(','), ...lines].join('\n'), 'text/csv;charset=utf-8');
  }

  function exportJson() {
    downloadFile(`${baseName}.json`, JSON.stringify(data, null, 2), 'application/json');
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold">Data export</h1>
        <p className="text-sm text-slate-500">
          Browse raw check history for any monitor over a time range, then export it as CSV or JSON.
        </p>
      </div>

      {/* Filters */}
      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="ex-monitor">Monitor</Label>
            <select
              id="ex-monitor"
              value={monitorId}
              onChange={(e) => setMonitorId(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="all">All monitors</option>
              {monitors?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ex-from">Start</Label>
            <input
              id="ex-from"
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={SELECT_CLASS}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ex-to">End</Label>
            <input
              id="ex-to"
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={SELECT_CLASS}
            />
          </div>
          <div className="flex items-end">
            <Button variant="outline" className="w-full" onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} aria-hidden />
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      {/* Results */}
      <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0b1220]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="font-semibold">Checks</h2>
            <p className="mt-0.5 font-mono text-xs text-slate-500">
              {isFetching ? 'Loading…' : `${data.length.toLocaleString()} row${data.length === 1 ? '' : 's'}`}
              {capped && ' (capped — narrow the range for older data)'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={exportCsv} disabled={data.length === 0}>
              <Download className="h-4 w-4" aria-hidden />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportJson} disabled={data.length === 0}>
              <FileJson className="h-4 w-4" aria-hidden />
              JSON
            </Button>
          </div>
        </div>

        <div className="max-h-[calc(100vh-22rem)] overflow-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c}
                    className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/70"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isError ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-4 py-12 text-center text-sm text-red-600">
                    Failed to load checks.
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-4 py-12 text-center text-sm text-slate-500">
                    {isFetching ? 'Loading…' : 'No checks in this range.'}
                  </td>
                </tr>
              ) : (
                data.map((r, i) => {
                  const meta = beatMeta(r.status);
                  return (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="whitespace-nowrap border-b border-slate-100 px-4 py-2.5 font-mono text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
                        {fullTime(r.createdAt)}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-2.5 font-medium dark:border-slate-800">
                        {r.monitorName}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
                        <span className={cn('inline-flex items-center gap-1.5 font-medium', meta.text)}>
                          <span className={cn('h-2 w-2 rounded-full', meta.solid)} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap border-b border-slate-100 px-4 py-2.5 font-mono text-xs tabular-nums text-slate-600 dark:border-slate-800 dark:text-slate-400">
                        {responseLabel(r.responseTime)}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-2.5 font-mono text-xs tabular-nums text-slate-600 dark:border-slate-800 dark:text-slate-400">
                        {r.statusCode ?? '—'}
                      </td>
                      <td className="max-w-xs truncate border-b border-slate-100 px-4 py-2.5 text-xs text-slate-500 dark:border-slate-800">
                        {r.message ?? '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
