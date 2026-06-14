'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * A tiny client component that blinks. Its only job in T5 is to PROVE the embedded Next.js app
 * hydrates (JS loads + runs) inside the Nest single-process server. Real components land in T14.
 */
export function StatusPing() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setOn((v) => !v), 800);
    return () => clearInterval(id);
  }, []);

  return (
    <span
      aria-hidden
      className={cn(
        'inline-block h-3 w-3 rounded-full transition-colors duration-500',
        on ? 'bg-emerald-500' : 'bg-emerald-300',
      )}
    />
  );
}
