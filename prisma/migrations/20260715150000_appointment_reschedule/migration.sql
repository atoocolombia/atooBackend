-- AlterEnum
ALTER TYPE "InspectionAppointmentStatus" ADD VALUE 'RESCHEDULE_PENDING';

-- AlterTable
ALTER TABLE "InspectionAppointment" ADD COLUMN "proposedAppointmentDate" TEXT;
ALTER TABLE "InspectionAppointment" ADD COLUMN "proposedAppointmentTime" TEXT;
ALTER TABLE "InspectionAppointment" ADD COLUMN "rescheduleInitiatedBy" TEXT;

-- CreateTable
CREATE TABLE "UserNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserNotification_userId_read_idx" ON "UserNotification"("userId", "read");
CREATE INDEX "UserNotification_userId_createdAt_idx" ON "UserNotification"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
