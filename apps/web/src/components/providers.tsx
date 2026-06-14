'use client';

import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth';
import { QueryProvider } from '@/lib/query';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <QueryProvider>
        <AuthProvider>{children}</AuthProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
