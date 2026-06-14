import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateEscalationPolicyInput,
  EscalationPolicyView,
  UpdateEscalationPolicyInput,
} from '@pingwatch/shared';
import type { PingWatchPrismaClient, Prisma } from '@pingwatch/db';
import { PRISMA_CLIENT } from '../common/di-tokens';
import { DomainException } from '../common/domain.exception';

type PolicyWithSteps = Prisma.EscalationPolicyGetPayload<{ include: { steps: true } }>;

/**
 * Admin CRUD for escalation policies (P4.3). Steps are replaced transactionally; every referenced
 * channel must belong to the caller's org. The engine half (firing steps) lives in
 * {@link EscalationService}.
 */
@Injectable()
export class EscalationAdminService {
  constructor(@Inject(PRISMA_CLIENT) private readonly db: PingWatchPrismaClient) {}

  async list(organizationId: string): Promise<EscalationPolicyView[]> {
    const policies = await this.db.escalationPolicy.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    return policies.map((p) => this.toView(p));
  }

  async get(organizationId: string, id: string): Promise<EscalationPolicyView> {
    return this.toView(await this.require(organizationId, id));
  }

  async create(organizationId: string, input: CreateEscalationPolicyInput): Promise<EscalationPolicyView> {
    await this.assertChannels(organizationId, input.steps.flatMap((s) => s.channelIds));
    const policy = await this.db.escalationPolicy.create({
      data: {
        organizationId,
        name: input.name,
        isActive: input.isActive,
        steps: {
          create: input.steps.map((s) => ({
            stepOrder: s.stepOrder,
            delayMinutes: s.delayMinutes,
            channelIds: s.channelIds.join(','),
          })),
        },
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    return this.toView(policy);
  }

  async update(
    organizationId: string,
    id: string,
    input: UpdateEscalationPolicyInput,
  ): Promise<EscalationPolicyView> {
    await this.require(organizationId, id);
    if (input.steps) await this.assertChannels(organizationId, input.steps.flatMap((s) => s.channelIds));

    const data: Prisma.EscalationPolicyUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    await this.db.$transaction(async (tx) => {
      await tx.escalationPolicy.update({ where: { id }, data });
      if (input.steps) {
        await tx.escalationStep.deleteMany({ where: { policyId: id } });
        await tx.escalationStep.createMany({
          data: input.steps.map((s) => ({
            policyId: id,
            stepOrder: s.stepOrder,
            delayMinutes: s.delayMinutes,
            channelIds: s.channelIds.join(','),
          })),
        });
      }
    });
    return this.get(organizationId, id);
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await this.require(organizationId, id);
    await this.db.escalationPolicy.delete({ where: { id } });
  }

  private async assertChannels(organizationId: string, channelIds: string[]): Promise<void> {
    const unique = [...new Set(channelIds)];
    const found = await this.db.notificationChannel.findMany({
      where: { organizationId, id: { in: unique } },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      throw new DomainException('VALIDATION_ERROR', 'One or more channels do not belong to this organization', 400);
    }
  }

  private async require(organizationId: string, id: string): Promise<PolicyWithSteps> {
    const policy = await this.db.escalationPolicy.findFirst({
      where: { id, organizationId },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!policy) throw new DomainException('NOT_FOUND', 'Escalation policy not found', 404);
    return policy;
  }

  private toView(policy: PolicyWithSteps): EscalationPolicyView {
    return {
      id: policy.id,
      name: policy.name,
      isActive: policy.isActive,
      steps: policy.steps
        .slice()
        .sort((a, b) => a.stepOrder - b.stepOrder)
        .map((s) => ({
          stepOrder: s.stepOrder,
          delayMinutes: s.delayMinutes,
          channelIds: s.channelIds.split(',').filter(Boolean),
        })),
    };
  }
}
