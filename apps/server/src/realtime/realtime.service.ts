import { type Server as HttpServer } from 'node:http';
import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, type Socket } from 'socket.io';
import type { PingWatchPrismaClient } from '@pingwatch/db';
import { AuthJwtService } from '../auth/jwt.service';
import { PRISMA_CLIENT } from '../common/di-tokens';
import { MONITOR_BEAT_EVENT, type MonitorBeatEvent } from '../engine/scheduler.types';

interface SocketData {
  organizationId: string;
}

/**
 * Realtime gateway (PLAN §5.3): one scoped socket.io connection per dashboard. The handshake auth
 * carries the in-memory access token; on success the socket joins its org room. Beats are pushed
 * as deltas to the org room only — never a full-state broadcast, never to public pages.
 */
@Injectable()
export class RealtimeService {
  private io: Server | null = null;
  private readonly orgByMonitor = new Map<string, string>();

  constructor(
    private readonly jwt: AuthJwtService,
    @Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient,
  ) {}

  attach(httpServer: HttpServer): void {
    const io = new Server(httpServer, { path: '/ws', serveClient: false, cors: { origin: false } });
    io.use((socket: Socket, next) => {
      const token = (socket.handshake.auth as { token?: string } | undefined)?.token;
      if (!token) {
        next(new Error('auth-expired'));
        return;
      }
      void this.authenticate(socket, token, next);
    });
    io.on('connection', (socket: Socket) => {
      const { organizationId } = socket.data as SocketData;
      if (organizationId) void socket.join(`org:${organizationId}`);
    });
    this.io = io;
  }

  private async authenticate(
    socket: Socket,
    token: string,
    next: (err?: Error) => void,
  ): Promise<void> {
    try {
      const claims = this.jwt.verify(token);
      const membership = await this.db.membership.findFirst({ where: { userId: claims.sub } });
      if (!membership) {
        next(new Error('unauthorized'));
        return;
      }
      (socket.data as SocketData).organizationId = membership.organizationId;
      next();
    } catch {
      next(new Error('auth-expired'));
    }
  }

  @OnEvent(MONITOR_BEAT_EVENT)
  async onBeat(beat: MonitorBeatEvent): Promise<void> {
    if (!this.io) return;
    let organizationId = this.orgByMonitor.get(beat.monitorId);
    if (!organizationId) {
      const monitor = await this.db.monitor.findUnique({
        where: { id: beat.monitorId },
        select: { organizationId: true },
      });
      if (!monitor) return;
      organizationId = monitor.organizationId;
      this.orgByMonitor.set(beat.monitorId, organizationId);
    }
    this.io.to(`org:${organizationId}`).emit('monitor:update', {
      monitorId: beat.monitorId,
      status: beat.status,
      responseTime: beat.result.responseTimeMs,
      at: beat.at,
    });
  }
}
