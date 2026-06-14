/**
 * Status page DTOs (PLAN §5.5 / P3.4–P3.5). The admin curates which monitors appear; the public
 * projection (served anonymously) exposes ONLY display fields — never internal ids or config.
 */
import { z } from 'zod';
import type { MonitorStatus } from './constants';

export const createStatusPageSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  themeColor: z.string().max(20).optional(),
  isPublished: z.boolean().default(true),
  monitorIds: z.array(z.string()).default([]),
});
export type CreateStatusPageInput = z.infer<typeof createStatusPageSchema>;

export const updateStatusPageSchema = createStatusPageSchema.partial();
export type UpdateStatusPageInput = z.infer<typeof updateStatusPageSchema>;

/** What the dashboard editor sees for a status page (admin view). */
export interface StatusPageAdminView {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  themeColor: string | null;
  isPublished: boolean;
  monitorIds: string[];
  publicUrl: string;
}

/** The anonymous public projection — no internal ids, no config. */
export interface PublicStatusPage {
  title: string;
  description: string | null;
  themeColor: string | null;
  overall: 'operational' | 'degraded' | 'down';
  items: Array<{ name: string; status: MonitorStatus; uptime24h: number | null; uptime30d: number | null }>;
}
