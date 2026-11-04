CREATE TYPE "VehicleHistoryEventType" AS ENUM (
  'DAMAGE',
  'WORKSHOP_VISIT',
  'PERIODIC_REVIEW',
  'TECHNOMECHANICAL',
  'PART_REPLACEMENT',
  'OTHER'
);

CREATE TYPE "GeofenceExitRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "VehicleHistoryEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" "VehicleHistoryEventType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleHistoryEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VehicleHistoryEvent_userId_occurredAt_idx" ON "VehicleHistoryEvent"("userId", "occurredAt" DESC);

CREATE TABLE "GeofenceExitRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "GeofenceExitRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "destination" TEXT,
    "requestedFrom" TIMESTAMP(3),
    "requestedUntil" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeofenceExitRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GeofenceExitRequest_userId_createdAt_idx" ON "GeofenceExitRequest"("userId", "createdAt" DESC);
CREATE INDEX "GeofenceExitRequest_status_idx" ON "GeofenceExitRequest"("status");

ALTER TABLE "VehicleHistoryEvent" ADD CONSTRAINT "VehicleHistoryEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VehicleHistoryEvent" ADD CONSTRAINT "VehicleHistoryEvent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GeofenceExitRequest" ADD CONSTRAINT "GeofenceExitRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeofenceExitRequest" ADD CONSTRAINT "GeofenceExitRequest_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
