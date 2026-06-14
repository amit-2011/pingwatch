-- AlterTable
ALTER TABLE "Incident" ADD COLUMN "escalationPolicyId" TEXT;
ALTER TABLE "Incident" ADD COLUMN "lastEscalatedStep" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "EscalationPolicy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EscalationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalationStep" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "delayMinutes" INTEGER NOT NULL,
    "channelIds" TEXT NOT NULL,

    CONSTRAINT "EscalationStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EscalationPolicy_organizationId_idx" ON "EscalationPolicy"("organizationId");

-- CreateIndex
CREATE INDEX "EscalationStep_policyId_idx" ON "EscalationStep"("policyId");

-- CreateIndex
CREATE UNIQUE INDEX "EscalationStep_policyId_stepOrder_key" ON "EscalationStep"("policyId", "stepOrder");

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_escalationPolicyId_fkey" FOREIGN KEY ("escalationPolicyId") REFERENCES "EscalationPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationPolicy" ADD CONSTRAINT "EscalationPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationStep" ADD CONSTRAINT "EscalationStep_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "EscalationPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
