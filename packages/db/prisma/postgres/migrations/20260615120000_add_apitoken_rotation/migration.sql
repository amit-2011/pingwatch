-- AlterTable
ALTER TABLE "ApiToken" ADD COLUMN "family" TEXT;
ALTER TABLE "ApiToken" ADD COLUMN "rotatedToId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_rotatedToId_key" ON "ApiToken"("rotatedToId");

-- CreateIndex
CREATE INDEX "ApiToken_family_idx" ON "ApiToken"("family");
