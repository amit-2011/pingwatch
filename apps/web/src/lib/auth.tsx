'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { type AuthUser, apiFetch, refreshSession, setAccessToken } from './api';

type AuthStatus = 'loading' | 'needs-setup' | 'unauthenticated' | 'authenticated';

interface SetupInput {
  email: string;
  password: string;
  name?: string;
  orgName?: string;
}

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  setup: (input: SetupInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const state = (await fetch('/api/setup/state').then((r) => r.json())) as { completed: boolean };
        if (cancelled) return;
        if (!state.completed) {
          setStatus('needs-setup');
          return;
        }
        const refreshed = await refreshSession();
        if (cancelled) return;
        if (refreshed) {
          setUser(refreshed.user);
          setStatus('authenticated');
        } else {
          setStatus('unauthenticated');
        }
      } catch {
        if (!cancelled) setStatus('unauthenticated');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<{ accessToken: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAccessToken(data.accessToken);
    setUser(data.user);
    setStatus('authenticated');
  }, []);

  const setup = useCallback(async (input: SetupInput) => {
    const data = await apiFetch<{ accessToken: string; user: AuthUser }>('/setup', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setAccessToken(data.accessToken);
    setUser(data.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // ignore — clear local state regardless
    }
    setAccessToken(null);
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, login, setup, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
