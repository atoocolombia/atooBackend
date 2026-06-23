-- CreateTable
CREATE TABLE "LandingAuditLog" (
    "id" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LandingAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LandingAuditLog_createdAt_idx" ON "LandingAuditLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "LandingAuditLog_actorEmail_idx" ON "LandingAuditLog"("actorEmail");
