'use client';

import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';
import { type Socket, io } from 'socket.io-client';
import { type MonitorView, getAccessToken, refreshSession } from './api';

interface MonitorUpdate {
  monitorId: string;
  status: MonitorView['status'];
  responseTime: number | null;
  at: number;
}

/**
 * Live updates over one scoped socket.io connection (PLAN §5.3). Deltas patch the TanStack Query
 * cache directly (no refetch). On `auth-expired`/connect error it refreshes the access token and
 * re-handshakes, so the socket survives the 15-minute access-token expiry.
 */
export function SocketProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();

  useEffect(() => {
    let active = true;
    const socket: Socket = io('/', {
      path: '/ws',
      transports: ['websocket', 'polling'],
      auth: (cb) => cb({ token: getAccessToken() }),
    });

    socket.on('monitor:update', (update: MonitorUpdate) => {
      qc.setQueryData<MonitorView[]>(['monitors'], (old) =>
        old?.map((m) =>
          m.id === update.monitorId
            ? { ...m, status: update.status, lastResponseTime: update.responseTime }
            : m,
        ),
      );
      void qc.invalidateQueries({ queryKey: ['monitor', update.monitorId], exact: true });
    });

    socket.on('connect_error', (err: Error) => {
      if (!active || err.message !== 'auth-expired') return;
      void refreshSession().then((refreshed) => {
        if (refreshed && active) socket.connect();
      });
    });

    return () => {
      active = false;
      socket.disconnect();
    };
  }, [qc]);

  return <>{children}</>;
}
