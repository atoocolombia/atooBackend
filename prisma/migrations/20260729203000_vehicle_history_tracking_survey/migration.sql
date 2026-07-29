-- CreateEnum
CREATE TYPE "InspectionSurveyStatus" AS ENUM ('PENDING', 'SUBMITTED');

-- AlterTable
ALTER TABLE "InspectionAppointment"
ADD COLUMN "vehicleNameSnapshot" TEXT,
ADD COLUMN "vinSnapshot" TEXT;

-- AlterTable
ALTER TABLE "UserNotification"
ADD COLUMN "reminderKey" TEXT;

-- CreateTable
CREATE TABLE "InspectionSurvey" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "InspectionSurveyStatus" NOT NULL DEFAULT 'PENDING',
    "rating" INTEGER,
    "comment" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InspectionSurvey_sessionId_key" ON "InspectionSurvey"("sessionId");

-- CreateIndex
CREATE INDEX "InspectionSurvey_userId_status_idx" ON "InspectionSurvey"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "UserNotification_userId_reminderKey_key"
ON "UserNotification"("userId", "reminderKey");

-- AddForeignKey
ALTER TABLE "InspectionSurvey"
ADD CONSTRAINT "InspectionSurvey_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "InspectionSession"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionSurvey"
ADD CONSTRAINT "InspectionSurvey_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
