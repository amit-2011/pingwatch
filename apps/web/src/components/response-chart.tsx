'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { HistoryPoint } from '@/lib/api';

/**
 * Response-time chart over a normalized history series (raw beats for short
 * ranges, rollup buckets for long ones). Draws the avg-ping line on a light grid, with shaded
 * vertical bands behind it — colours match the heartbeat bar: red for DOWN, amber for PENDING,
 * blue for MAINTENANCE. The line breaks (null) wherever there was no successful sample, so gaps
 * sit under their band.
 */

type BandKind = 'down' | 'pending' | 'maint';

interface Band {
  x1: number;
  x2: number;
  fill: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const fmtFull = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const MIN_MS = 60_000;
const HOUR_MS = 60 * MIN_MS;
const DAY_MS = 24 * HOUR_MS;
// Round, human time steps for evenly-spaced axis ticks (ascending).
const NICE_STEPS = [
  MIN_MS, 2 * MIN_MS, 5 * MIN_MS, 10 * MIN_MS, 15 * MIN_MS, 30 * MIN_MS,
  HOUR_MS, 2 * HOUR_MS, 3 * HOUR_MS, 6 * HOUR_MS, 12 * HOUR_MS,
  DAY_MS, 2 * DAY_MS, 7 * DAY_MS, 14 * DAY_MS, 30 * DAY_MS, 90 * DAY_MS,
];

/** Pick the smallest round step that yields ≤ ~8 intervals across the span. */
function niceStep(span: number): number {
  for (const s of NICE_STEPS) if (span / s <= 8) return s;
  return NICE_STEPS[NICE_STEPS.length - 1]!;
}

/** Evenly-spaced ticks on round boundaries, aligned to local wall-clock time. */
function timeTicks(min: number, max: number, step: number): number[] {
  if (max <= min) return [min];
  const tz = new Date(min).getTimezoneOffset() * MIN_MS; // local = utc - tz
  const start = Math.ceil((min - tz) / step) * step + tz;
  const ticks: number[] = [];
  for (let t = start; t <= max; t += step) ticks.push(t);
  return ticks.length ? ticks : [min, max];
}

/** Day-level steps label the date; finer steps label the time. */
function tickFormatter(step: number) {
  return (t: number) => {
    const d = new Date(t);
    return step >= DAY_MS ? `${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
}

// Band fills mirror the heartbeat-bar palette: red=down, amber=pending, blue=maintenance.
const BAND_FILL: Record<BandKind, string> = {
  down: 'rgba(239, 68, 68, 0.30)', // red-500
  pending: 'rgba(251, 191, 36, 0.34)', // amber-400
  maint: 'rgba(59, 130, 246, 0.28)', // blue-500
};

// Band a point only when it had NO successful sample (up === 0) — i.e. exactly where the line
// breaks. A rollup bucket that was mostly up with a few failures keeps its line and gets no red
// band, matching the raw-beat view (an up beat is never banded) and avoiding red over good data.
const bandOf = (p: HistoryPoint): BandKind | null =>
  p.up > 0 ? null : p.down > 0 ? 'down' : p.pending > 0 ? 'pending' : p.maint > 0 ? 'maint' : null;

/**
 * Collapse consecutive same-kind marks into shaded bands centred on their points. A run is also
 * broken across a data gap (consecutive marks more than ~1.5 steps apart) so that two down/maint
 * points straddling a hole — e.g. rollup buckets either side of an overnight outage in the 24h/1w
 * views — don't merge into one giant band bridging the empty span.
 */
function buildBands(marks: { t: number; kind: BandKind | null }[], step: number): Band[] {
  const half = step / 2;
  const maxGap = step * 1.5;
  const bands: Band[] = [];
  let run: { t: number; kind: BandKind }[] = [];
  let prevT: number | null = null;
  const flush = () => {
    if (run.length === 0) return;
    bands.push({ x1: run[0]!.t - half, x2: run[run.length - 1]!.t + half, fill: BAND_FILL[run[0]!.kind] });
    run = [];
  };
  for (const m of marks) {
    const gapped = prevT !== null && m.t - prevT > maxGap;
    if (m.kind === null) {
      flush();
    } else if (run.length > 0 && (run[0]!.kind !== m.kind || gapped)) {
      flush();
      run.push({ t: m.t, kind: m.kind });
    } else {
      run.push({ t: m.t, kind: m.kind });
    }
    prevT = m.t;
  }
  flush();
  return bands;
}

// Kuma-style green palette: avg is the light mid-tone, min the darkest, max the brightest.
const COLOR_AVG = '#5cdd8b';
const COLOR_MIN = '#15803d';
const COLOR_MAX = '#22c55e';

// Per-series label + colour, keyed by dataKey (the band is excluded from the tooltip).
const SERIES_META: Record<string, { label: string; color: string }> = {
  min: { label: 'Min Ping', color: COLOR_MIN },
  avg: { label: 'Avg Ping', color: COLOR_AVG },
  max: { label: 'Max Ping', color: COLOR_MAX },
};
const TOOLTIP_ORDER = ['min', 'avg', 'max'];

interface TooltipPayloadItem {
  dataKey?: string | number;
  value?: number | number[] | null;
}

/** Compact Min/Avg/Max tooltip, driven by Recharts' payload (null samples are dropped). */
function ChartTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: number | string;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload?.length) return null;
  const byKey = new Map(payload.map((p) => [String(p.dataKey), p.value]));
  const rows = TOOLTIP_ORDER.filter((k) => byKey.has(k))
    .map((k) => ({ ...SERIES_META[k]!, value: byKey.get(k) }))
    .filter((r) => typeof r.value === 'number');
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-1 text-slate-500">{fmtFull(Number(label))}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 font-semibold" style={{ color: r.color }}>
          <span className="inline-block h-0.5 w-3 rounded" style={{ backgroundColor: r.color }} />
          {r.label} : {Math.round(Number(r.value))} ms
        </div>
      ))}
    </div>
  );
}

/** Y bounds that hug the data (floor near the min, like Kuma) rounded to a tidy step. */
function yDomain(values: number[]): [number, number] {
  if (values.length === 0) return [0, 100];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const stepGuess = span > 400 ? 100 : span > 150 ? 50 : span > 40 ? 25 : 10;
  const lo = Math.max(0, Math.floor((min - span * 0.25) / stepGuess) * stepGuess);
  const hi = Math.ceil((max + span * 0.15) / stepGuess) * stepGuess;
  return [lo, hi === lo ? lo + stepGuess : hi];
}

/**
 * @param showMinMax  Draw the Min/Avg/Max trio + shaded min–max band (rollup & windowed ranges).
 *                    Off for the "recent" raw-beat view, where min = avg = max per point.
 */
export function ResponseChart({ points, showMinMax = false }: { points: HistoryPoint[]; showMinMax?: boolean }) {
  if (points.length === 0) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-400">No data yet</div>;
  }

  const data = points.map((p) => ({
    t: p.t,
    avg: p.avg,
    min: p.min,
    max: p.max,
    // Range area between min and max; null breaks the band under data gaps.
    band: p.min !== null && p.max !== null ? ([p.min, p.max] as [number, number]) : null,
  }));
  const marks = points.map((p) => ({ t: p.t, kind: bandOf(p) }));

  // Median gap between points → band width + a sane fallback when only one point exists.
  const gaps = points.slice(1).map((p, i) => p.t - points[i]!.t).filter((g) => g > 0).sort((a, b) => a - b);
  const step = gaps.length ? gaps[Math.floor(gaps.length / 2)]! : 60_000;
  const bands = buildBands(marks, step);
  const yValues = data
    .flatMap((d) => (showMinMax ? [d.min, d.avg, d.max] : [d.avg]))
    .filter((v): v is number => v !== null);
  const domain = yDomain(yValues);

  // Evenly-spaced, round X-axis ticks (Kuma-style) instead of Recharts' pixel-based data-point ticks.
  const tMin = points[0]!.t;
  const tMax = points[points.length - 1]!.t;
  const tickStep = niceStep(Math.max(tMax - tMin, 1));
  const xTicks = timeTicks(tMin, tMax, tickStep);

  return (
    <ResponsiveContainer
      width="100%"
      height="100%"
      className="[&_.recharts-surface]:outline-none [&_.recharts-wrapper]:outline-none [&_svg]:outline-none"
    >
      <AreaChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 4 }} accessibilityLayer={false}>
        <defs>
          <linearGradient id="rt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLOR_AVG} stopOpacity={0.45} />
            <stop offset="100%" stopColor={COLOR_AVG} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="currentColor" strokeOpacity={0.12} vertical horizontal />
        {bands.map((b, i) => (
          <ReferenceArea key={i} x1={b.x1} x2={b.x2} fill={b.fill} stroke="none" ifOverflow="extendDomain" />
        ))}
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          ticks={xTicks}
          interval={0}
          tick={{ fontSize: 11 }}
          tickFormatter={tickFormatter(tickStep)}
          tickMargin={8}
          stroke="currentColor"
          strokeOpacity={0.25}
        />
        <YAxis
          width={64}
          tick={{ fontSize: 11 }}
          unit=" ms"
          domain={domain}
          allowDecimals={false}
          tickMargin={6}
          stroke="currentColor"
          strokeOpacity={0.25}
          label={{
            value: 'Resp. Time (ms)',
            angle: -90,
            position: 'insideLeft',
            style: { fontSize: 11, fill: 'currentColor', opacity: 0.55, textAnchor: 'middle' },
          }}
        />
        <Tooltip content={<ChartTooltip />} />
        <Legend verticalAlign="top" align="left" height={24} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
        {showMinMax ? (
          <>
            <Area
              type="monotone"
              dataKey="band"
              name="Range"
              legendType="none"
              stroke="none"
              fill={COLOR_AVG}
              fillOpacity={0.12}
              connectNulls={false}
              isAnimationActive={false}
              activeDot={false}
            />
            <Area
              type="monotone"
              dataKey="min"
              name="Min Ping"
              stroke={COLOR_MIN}
              strokeWidth={1.5}
              fill="none"
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="avg"
              name="Avg Ping"
              stroke={COLOR_AVG}
              strokeWidth={2}
              strokeLinecap="round"
              fill="none"
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="max"
              name="Max Ping"
              stroke={COLOR_MAX}
              strokeWidth={1.5}
              fill="none"
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </>
        ) : (
          <Area
            type="monotone"
            dataKey="avg"
            name="Avg Ping"
            stroke={COLOR_AVG}
            strokeWidth={2}
            strokeLinecap="round"
            fill="url(#rt)"
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
