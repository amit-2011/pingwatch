-- CreateTable
CREATE TABLE "MetricSample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "monitorId" TEXT NOT NULL,
    "cpuPct" REAL,
    "memPct" REAL,
    "diskPct" REAL,
    "netInKbps" REAL,
    "netOutKbps" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MetricSample_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MaintenanceWindow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "monitorId" TEXT,
    "title" TEXT NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MaintenanceWindow_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MaintenanceWindow_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MetricSample_monitorId_createdAt_idx" ON "MetricSample"("monitorId", "createdAt");

-- CreateIndex
CREATE INDEX "MaintenanceWindow_organizationId_idx" ON "MaintenanceWindow"("organizationId");

-- CreateIndex
CREATE INDEX "MaintenanceWindow_startsAt_endsAt_idx" ON "MaintenanceWindow"("startsAt", "endsAt");
