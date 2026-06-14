-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Monitor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'http',
    "config" TEXT NOT NULL,
    "intervalSeconds" INTEGER NOT NULL DEFAULT 60,
    "retries" INTEGER NOT NULL DEFAULT 3,
    "retryIntervalSeconds" INTEGER NOT NULL DEFAULT 30,
    "timeoutMs" INTEGER NOT NULL DEFAULT 30000,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "lastCheckedAt" DATETIME,
    "lastStatusChangeAt" DATETIME,
    "lastResponseTime" INTEGER,
    "uptime24h" REAL,
    "uptime7d" REAL,
    "uptime30d" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Monitor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Monitor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Heartbeat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "monitorId" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "responseTime" INTEGER,
    "statusCode" INTEGER,
    "message" TEXT,
    "important" BOOLEAN NOT NULL DEFAULT false,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "coverageMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Heartbeat_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StatHourly" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "monitorId" TEXT NOT NULL,
    "bucket" DATETIME NOT NULL,
    "upCount" INTEGER NOT NULL DEFAULT 0,
    "downCount" INTEGER NOT NULL DEFAULT 0,
    "maintenanceCount" INTEGER NOT NULL DEFAULT 0,
    "upMs" INTEGER NOT NULL DEFAULT 0,
    "downMs" INTEGER NOT NULL DEFAULT 0,
    "avgResponseTime" REAL,
    "minResponseTime" INTEGER,
    "maxResponseTime" INTEGER,
    CONSTRAINT "StatHourly_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StatDaily" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "monitorId" TEXT NOT NULL,
    "bucket" DATETIME NOT NULL,
    "upCount" INTEGER NOT NULL DEFAULT 0,
    "downCount" INTEGER NOT NULL DEFAULT 0,
    "maintenanceCount" INTEGER NOT NULL DEFAULT 0,
    "upMs" INTEGER NOT NULL DEFAULT 0,
    "downMs" INTEGER NOT NULL DEFAULT 0,
    "avgResponseTime" REAL,
    "minResponseTime" INTEGER,
    "maxResponseTime" INTEGER,
    CONSTRAINT "StatDaily_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "lastError" TEXT,
    "lastTestedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NotificationChannel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MonitorNotification" (
    "monitorId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "notifyOn" TEXT NOT NULL DEFAULT 'down,up',
    "resendEveryMin" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("monitorId", "channelId"),
    CONSTRAINT "MonitorNotification_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MonitorNotification_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "NotificationChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Incident" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Incident_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Incident_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IncidentUpdate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incidentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT,
    "meta" TEXT,
    "status" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IncidentUpdate_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StatusPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "themeColor" TEXT,
    "passwordHash" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StatusPage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StatusPageItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "statusPageId" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "displayName" TEXT,
    "groupName" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "StatusPageItem_statusPageId_fkey" FOREIGN KEY ("statusPageId") REFERENCES "StatusPage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StatusPageItem_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "monitorId" TEXT,
    "scopes" TEXT NOT NULL,
    "createdById" TEXT,
    "lastUsedAt" DATETIME,
    "expiresAt" DATETIME,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApiToken_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApiToken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SetupState" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "completedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_slug_idx" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Membership_organizationId_idx" ON "Membership"("organizationId");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_organizationId_key" ON "Membership"("userId", "organizationId");

-- CreateIndex
CREATE INDEX "Project_organizationId_idx" ON "Project"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_organizationId_slug_key" ON "Project"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "Monitor_organizationId_idx" ON "Monitor"("organizationId");

-- CreateIndex
CREATE INDEX "Monitor_projectId_idx" ON "Monitor"("projectId");

-- CreateIndex
CREATE INDEX "Monitor_organizationId_isActive_idx" ON "Monitor"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "Heartbeat_monitorId_createdAt_idx" ON "Heartbeat"("monitorId", "createdAt");

-- CreateIndex
CREATE INDEX "Heartbeat_monitorId_important_createdAt_idx" ON "Heartbeat"("monitorId", "important", "createdAt");

-- CreateIndex
CREATE INDEX "Heartbeat_createdAt_idx" ON "Heartbeat"("createdAt");

-- CreateIndex
CREATE INDEX "StatHourly_monitorId_bucket_idx" ON "StatHourly"("monitorId", "bucket");

-- CreateIndex
CREATE UNIQUE INDEX "StatHourly_monitorId_bucket_key" ON "StatHourly"("monitorId", "bucket");

-- CreateIndex
CREATE INDEX "StatDaily_monitorId_bucket_idx" ON "StatDaily"("monitorId", "bucket");

-- CreateIndex
CREATE UNIQUE INDEX "StatDaily_monitorId_bucket_key" ON "StatDaily"("monitorId", "bucket");

-- CreateIndex
CREATE INDEX "NotificationChannel_organizationId_idx" ON "NotificationChannel"("organizationId");

-- CreateIndex
CREATE INDEX "MonitorNotification_channelId_idx" ON "MonitorNotification"("channelId");

-- CreateIndex
CREATE INDEX "Incident_organizationId_status_idx" ON "Incident"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Incident_monitorId_status_idx" ON "Incident"("monitorId", "status");

-- CreateIndex
CREATE INDEX "IncidentUpdate_incidentId_createdAt_idx" ON "IncidentUpdate"("incidentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StatusPage_slug_key" ON "StatusPage"("slug");

-- CreateIndex
CREATE INDEX "StatusPage_organizationId_idx" ON "StatusPage"("organizationId");

-- CreateIndex
CREATE INDEX "StatusPage_slug_idx" ON "StatusPage"("slug");

-- CreateIndex
CREATE INDEX "StatusPageItem_statusPageId_idx" ON "StatusPageItem"("statusPageId");

-- CreateIndex
CREATE UNIQUE INDEX "StatusPageItem_statusPageId_monitorId_key" ON "StatusPageItem"("statusPageId", "monitorId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ApiToken_organizationId_idx" ON "ApiToken"("organizationId");

-- CreateIndex
CREATE INDEX "ApiToken_prefix_idx" ON "ApiToken"("prefix");
