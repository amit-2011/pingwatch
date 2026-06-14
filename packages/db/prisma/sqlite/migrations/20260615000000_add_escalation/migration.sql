-- CreateTable
CREATE TABLE "EscalationPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EscalationPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EscalationStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "policyId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "delayMinutes" INTEGER NOT NULL,
    "channelIds" TEXT NOT NULL,
    CONSTRAINT "EscalationStep_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "EscalationPolicy" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Incident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "severity" TEXT NOT NULL DEFAULT 'major',
    "title" TEXT NOT NULL,
    "cause" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" DATETIME,
    "acknowledgedBy" TEXT,
    "resolvedAt" DATETIME,
    "lastNotifiedAt" DATETIME,
    "notifyCount" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "escalationPolicyId" TEXT,
    "lastEscalatedStep" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Incident_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Incident_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Incident_escalationPolicyId_fkey" FOREIGN KEY ("escalationPolicyId") REFERENCES "EscalationPolicy" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Incident" ("acknowledgedAt", "acknowledgedBy", "cause", "createdAt", "id", "isPublished", "lastNotifiedAt", "monitorId", "notifyCount", "organizationId", "resolvedAt", "severity", "startedAt", "status", "title", "updatedAt") SELECT "acknowledgedAt", "acknowledgedBy", "cause", "createdAt", "id", "isPublished", "lastNotifiedAt", "monitorId", "notifyCount", "organizationId", "resolvedAt", "severity", "startedAt", "status", "title", "updatedAt" FROM "Incident";
DROP TABLE "Incident";
ALTER TABLE "new_Incident" RENAME TO "Incident";
CREATE INDEX "Incident_organizationId_status_idx" ON "Incident"("organizationId", "status");
CREATE INDEX "Incident_monitorId_status_idx" ON "Incident"("monitorId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "EscalationPolicy_organizationId_idx" ON "EscalationPolicy"("organizationId");

-- CreateIndex
CREATE INDEX "EscalationStep_policyId_idx" ON "EscalationStep"("policyId");

-- CreateIndex
CREATE UNIQUE INDEX "EscalationStep_policyId_stepOrder_key" ON "EscalationStep"("policyId", "stepOrder");

