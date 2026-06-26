/** Shared display formatters so numbers/dates read consistently across the app. */

export function uptimeLabel(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(value >= 99.95 ? 2 : 1)}%`;
}

export function responseLabel(ms: number | null | undefined): string {
  return ms === null || ms === undefined ? '—' : `${Math.round(ms)} ms`;
}

/** A compact "every 60s" / "every 5m" cadence label. */
export function intervalLabel(seconds: number): string {
  if (seconds < 60) return `every ${seconds}s`;
  const m = Math.round(seconds / 60);
  return `every ${m}m`;
}

/** Ultra-compact elapsed label for strip/chart ends: "now", "43m", "2h", "3d". */
export function shortSince(iso: string | null | undefined): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (s < 60) return 'now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/** Full local timestamp "YYYY-MM-DD HH:MM:SS" for tooltips. */
export function fullTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Short relative time like "12s ago", "3m ago", "2h ago", "now". */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = Math.max(0, Date.now() - then);
  const s = Math.round(diff / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
