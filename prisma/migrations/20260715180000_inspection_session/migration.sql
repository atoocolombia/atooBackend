-- AlterEnum
ALTER TYPE "InspectionAppointmentStatus" ADD VALUE 'IN_PROGRESS';

-- CreateEnum
CREATE TYPE "InspectionSessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ProcedureSuggestionStatus" AS ENUM ('PENDING_ADMIN', 'APPROVED_IMMEDIATE', 'APPROVED_CLIENT_SCHEDULE', 'REJECTED');

-- CreateTable
CREATE TABLE "InspectionSession" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "status" "InspectionSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionChecklistItem" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionProcedureSuggestion" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "estimatedCostCop" INTEGER,
    "isUrgent" BOOLEAN NOT NULL DEFAULT false,
    "status" "ProcedureSuggestionStatus" NOT NULL DEFAULT 'PENDING_ADMIN',
    "adminNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "deadlineAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionProcedureSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InspectionSession_appointmentId_key" ON "InspectionSession"("appointmentId");

-- CreateIndex
CREATE INDEX "InspectionChecklistItem_sessionId_idx" ON "InspectionChecklistItem"("sessionId");

-- CreateIndex
CREATE INDEX "InspectionProcedureSuggestion_sessionId_idx" ON "InspectionProcedureSuggestion"("sessionId");

-- CreateIndex
CREATE INDEX "InspectionProcedureSuggestion_status_idx" ON "InspectionProcedureSuggestion"("status");

-- AddForeignKey
ALTER TABLE "InspectionSession" ADD CONSTRAINT "InspectionSession_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "InspectionAppointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionChecklistItem" ADD CONSTRAINT "InspectionChecklistItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InspectionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionProcedureSuggestion" ADD CONSTRAINT "InspectionProcedureSuggestion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InspectionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
