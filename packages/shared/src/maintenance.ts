/**
 * Maintenance window DTOs (PLAN §4.4 / P3.7). A window suppresses alerts for a monitor (or the whole
 * org when monitorId is null) between startsAt and endsAt, so planned downtime doesn't page anyone.
 */
import { z } from 'zod';

const baseShape = {
  title: z.string().min(1).max(120),
  monitorId: z.string().nullable().default(null), // null ⇒ applies to every monitor in the org
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
};

export const createMaintenanceWindowSchema = z
  .object(baseShape)
  .refine((d) => new Date(d.endsAt) > new Date(d.startsAt), {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  });
export type CreateMaintenanceWindowInput = z.infer<typeof createMaintenanceWindowSchema>;

export const updateMaintenanceWindowSchema = z.object(baseShape).partial();
export type UpdateMaintenanceWindowInput = z.infer<typeof updateMaintenanceWindowSchema>;

export interface MaintenanceWindowView {
  id: string;
  title: string;
  monitorId: string | null;
  monitorName: string | null; // null ⇒ all monitors
  startsAt: string;
  endsAt: string;
  /** True when the current time falls within [startsAt, endsAt]. */
  isActive: boolean;
}
