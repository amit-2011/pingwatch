import { StatusPing } from '@/components/status-ping';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-slate-50 to-slate-200 px-6 text-center dark:from-slate-950 dark:to-slate-900">
      <div className="flex items-center gap-3">
        <StatusPing />
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          PingWatch
        </h1>
      </div>
      <p className="max-w-md text-slate-600 dark:text-slate-400">
        Self-hosted uptime &amp; system monitoring — served by NestJS, rendered by Next.js, in a
        single process.
      </p>
      <span className="rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-500 dark:border-slate-700">
        Dashboard arrives in T14
      </span>
    </main>
  );
}
