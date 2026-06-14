'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, FileUp, Upload } from 'lucide-react';
import { type ChangeEvent, useState } from 'react';
import { ApiError, type ImportReport, apiFetch, apiFetchText } from '@/lib/api';
import { Button, Card, Label } from '@/components/ui';

export default function ConfigPage() {
  const qc = useQueryClient();
  const [yaml, setYaml] = useState('');
  const [report, setReport] = useState<{ report: ImportReport; applied: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const exportConfig = useMutation({
    mutationFn: () => apiFetchText('/config/export'),
    onSuccess: (text) => {
      const blob = new Blob([text], { type: 'application/yaml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pingwatch-config.yaml';
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Export failed'),
  });

  const runImport = useMutation({
    mutationFn: (dryRun: boolean) =>
      apiFetch<ImportReport>('/config/import', { method: 'POST', body: JSON.stringify({ yaml, dryRun }) }),
    onSuccess: (r, dryRun) => {
      setReport({ report: r, applied: !dryRun });
      if (!dryRun) void qc.invalidateQueries();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Import failed'),
  });

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    void file.text().then((t) => {
      setYaml(t);
      setReport(null);
    });
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Config (YAML)</h1>
        <p className="text-sm text-slate-500">
          Version-control your setup as code. Channel secrets are redacted on export — fill them in before importing
          to a fresh instance.
        </p>
      </div>

      <Card className="mb-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">Export</h2>
            <p className="text-sm text-slate-500">Download this org’s full config as YAML.</p>
          </div>
          <Button onClick={() => exportConfig.mutate()} disabled={exportConfig.isPending}>
            <Download className="h-4 w-4" />
            {exportConfig.isPending ? 'Exporting…' : 'Download YAML'}
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-medium">Import</h2>
        <p className="mb-4 text-sm text-slate-500">Idempotent upsert by name/slug. Preview with a dry run first.</p>

        <div className="mb-3">
          <Label htmlFor="cfg-file" className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200">
            <FileUp className="h-4 w-4" />
            Choose a .yaml file
          </Label>
          <input id="cfg-file" type="file" accept=".yaml,.yml" onChange={onFile} className="sr-only" />
        </div>

        <textarea
          value={yaml}
          onChange={(e) => {
            setYaml(e.target.value);
            setReport(null);
          }}
          placeholder="# paste config YAML here, or choose a file above"
          className="h-56 w-full rounded-md border border-slate-300 bg-white p-3 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-700 dark:bg-slate-900"
        />

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setError(null);
              runImport.mutate(true);
            }}
            disabled={runImport.isPending || !yaml.trim()}
          >
            Preview (dry run)
          </Button>
          <Button
            onClick={() => {
              setError(null);
              runImport.mutate(false);
            }}
            disabled={runImport.isPending || !yaml.trim()}
          >
            <Upload className="h-4 w-4" />
            Apply import
          </Button>
        </div>

        {report && <ReportView report={report.report} applied={report.applied} />}
      </Card>
    </div>
  );
}

function ReportView({ report, applied }: { report: ImportReport; applied: boolean }) {
  const rows: Array<[string, { created: number; updated: number; skipped: number }]> = [
    ['Projects', report.projects],
    ['Channels', report.channels],
    ['Monitors', report.monitors],
    ['Status pages', report.statusPages],
    ['Maintenance', report.maintenanceWindows],
  ];
  return (
    <div className="mt-5 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <div className="mb-2 text-sm font-medium">
        {applied ? 'Imported ✓' : 'Dry run — nothing written'}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-slate-400">
            <th className="py-1">Resource</th>
            <th className="py-1">Created</th>
            <th className="py-1">Updated</th>
            <th className="py-1">Skipped</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, c]) => (
            <tr key={label} className="border-t border-slate-100 dark:border-slate-800">
              <td className="py-1.5">{label}</td>
              <td className="py-1.5 text-emerald-600 dark:text-emerald-400">+{c.created}</td>
              <td className="py-1.5">{c.updated}</td>
              <td className="py-1.5 text-slate-400">{c.skipped}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {report.warnings.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-amber-600 dark:text-amber-400">
          {report.warnings.map((w, i) => (
            <li key={i}>! {w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
