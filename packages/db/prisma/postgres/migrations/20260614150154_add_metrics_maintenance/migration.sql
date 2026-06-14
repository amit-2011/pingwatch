-- CreateTable
CREATE TABLE "MetricSample" (
    "id" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "cpuPct" DOUBLE PRECISION,
    "memPct" DOUBLE PRECISION,
    "diskPct" DOUBLE PRECISION,
    "netInKbps" DOUBLE PRECISION,
    "netOutKbps" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceWindow" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "monitorId" TEXT,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceWindow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MetricSample_monitorId_createdAt_idx" ON "MetricSample"("monitorId", "createdAt");

-- CreateIndex
CREATE INDEX "MaintenanceWindow_organizationId_idx" ON "MaintenanceWindow"("organizationId");

-- CreateIndex
CREATE INDEX "MaintenanceWindow_startsAt_endsAt_idx" ON "MaintenanceWindow"("startsAt", "endsAt");

-- AddForeignKey
ALTER TABLE "MetricSample" ADD CONSTRAINT "MetricSample_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceWindow" ADD CONSTRAINT "MaintenanceWindow_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceWindow" ADD CONSTRAINT "MaintenanceWindow_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
