'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Heartbeat } from '@/lib/api';
import { fullTime, shortSince } from '@/lib/format';
import { beatMeta, beatTipText } from '@/lib/status';
import { cn } from '@/lib/utils';

// Each beat occupies this many px: bar (10px / w-2.5) + gap (8px / gap-2). The visible count adapts
// to container width so the strip stays tight and uncluttered on every screen size, left-aligned
// with a fixed gap (trailing space stays empty rather than stretching).
const SLOT_PX = 18;
const MIN_BARS = 6;
const MAX_BARS = 80;
const OPEN_DELAY_MS = 250;

interface TipState {
  beat: Heartbeat;
  x: number; // viewport px, horizontal centre of the bar
  y: number; // viewport px, top of the bar
}

/**
 * Recent-checks strip: rounded pills evenly spread across the full width, count
 * responsive to width, with elapsed labels at the ends. The hover tooltip is rendered in a portal
 * to document.body so the dashboard's overflow-scroll containers can't clip it.
 */
export function HeartbeatBar({ beats }: { beats: Heartbeat[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [maxBars, setMaxBars] = useState(40);
  const [mounted, setMounted] = useState(false);
  const [tip, setTip] = useState<TipState | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const fit = Math.floor(el.clientWidth / SLOT_PX);
      setMaxBars(Math.min(Math.max(fit, MIN_BARS), MAX_BARS));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Clear any pending open-timer on unmount so a late timeout can't setState on a gone component.
  useEffect(() => () => clearOpen(), []);
  function clearOpen() {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
  }

  function openTip(e: React.MouseEvent<HTMLDivElement>, beat: Heartbeat) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top;
    clearOpen();
    openTimer.current = setTimeout(() => setTip({ beat, x, y }), OPEN_DELAY_MS);
  }
  function closeTip() {
    clearOpen();
    setTip(null);
  }

  if (beats.length === 0) {
    return <span className="text-xs text-slate-400">No checks yet</span>;
  }

  const shown = beats.slice(0, maxBars).reverse();

  return (
    // Outer element measures available width; the inner block shrinks to the bars so the end labels
    // line up with the first/last bar (not the full card width) when there's trailing space.
    <div ref={ref} className="w-full">
      <div className="inline-flex max-w-full flex-col">
        <div className="flex h-9 items-end gap-2">
          {shown.map((b, i) => {
            const meta = beatMeta(b.status);
            return (
              <div
                key={i}
                className="group relative flex h-full w-2.5 items-end"
                onMouseEnter={(e) => openTip(e, b)}
                onMouseLeave={closeTip}
              >
                <span
                  className={cn(
                    'block h-8 w-full origin-center rounded-full transition-transform duration-150 group-hover:scale-x-150 group-hover:scale-y-125',
                    meta.solid,
                  )}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-slate-400">
          <span>{shortSince(shown[0]?.createdAt)}</span>
          <span>now</span>
        </div>
      </div>
      {mounted && tip && createPortal(<BeatTooltip tip={tip} />, document.body)}
    </div>
  );
}

/** Fixed-position tooltip above the hovered bar, clamped to stay within the viewport. */
function BeatTooltip({ tip }: { tip: TipState }) {
  const { beat } = tip;
  const meta = beatMeta(beat.status);
  const detail = [beat.statusCode, beat.message].filter(Boolean).join(' - ');
  const left = Math.min(Math.max(tip.x, 90), window.innerWidth - 90);
  return (
    <div
      className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-slate-800 px-3 py-2 text-center shadow-xl dark:bg-slate-900"
      style={{ left, top: tip.y - 8 }}
    >
      <div className={cn('text-xs font-semibold', beatTipText(beat.status))}>{meta.label.toUpperCase()}</div>
      <div className="mt-1 border-t border-white/10 pt-1 text-xs text-slate-200">{fullTime(beat.createdAt)}</div>
      {detail && <div className="text-xs text-slate-400">{detail}</div>}
    </div>
  );
}
