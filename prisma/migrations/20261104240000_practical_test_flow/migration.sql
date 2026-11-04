-- Antecedentes + habilitación de cita práctica en solicitud
ALTER TABLE "Application" ADD COLUMN "assignedAnalystUserId" TEXT;
ALTER TABLE "Application" ADD COLUMN "practicalTestSchedulingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Application" ADD COLUMN "practicalTestInviteSentAt" TIMESTAMP(3);
ALTER TABLE "Application" ADD COLUMN "backgroundJudicialApproved" BOOLEAN;
ALTER TABLE "Application" ADD COLUMN "backgroundProcuraduriaApproved" BOOLEAN;
ALTER TABLE "Application" ADD COLUMN "backgroundSimitApproved" BOOLEAN;
ALTER TABLE "Application" ADD COLUMN "backgroundJudicialComment" TEXT;
ALTER TABLE "Application" ADD COLUMN "backgroundProcuraduriaComment" TEXT;
ALTER TABLE "Application" ADD COLUMN "backgroundSimitComment" TEXT;

CREATE TYPE "PracticalTestAppointmentStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

CREATE TABLE "AnalystWeeklySchedule" (
    "id" TEXT NOT NULL,
    "analystUserId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "slotMinutes" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalystWeeklySchedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnalystWeeklySchedule_analystUserId_weekday_key" ON "AnalystWeeklySchedule"("analystUserId", "weekday");
CREATE INDEX "AnalystWeeklySchedule_analystUserId_idx" ON "AnalystWeeklySchedule"("analystUserId");

CREATE TABLE "PracticalTestAppointment" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "analystUserId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "status" "PracticalTestAppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticalTestAppointment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PracticalTestAppointment_applicationId_key" ON "PracticalTestAppointment"("applicationId");
CREATE INDEX "PracticalTestAppointment_analystUserId_date_idx" ON "PracticalTestAppointment"("analystUserId", "date");
CREATE INDEX "PracticalTestAppointment_userId_idx" ON "PracticalTestAppointment"("userId");

CREATE TABLE "PracticalTestEvaluation" (
    "appointmentId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "experienceScore" DOUBLE PRECISION,
    "customerServiceScore" DOUBLE PRECISION,
    "overallScore" DOUBLE PRECISION,
    "analystNotes" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticalTestEvaluation_pkey" PRIMARY KEY ("appointmentId")
);

ALTER TABLE "AnalystWeeklySchedule" ADD CONSTRAINT "AnalystWeeklySchedule_analystUserId_fkey" FOREIGN KEY ("analystUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticalTestAppointment" ADD CONSTRAINT "PracticalTestAppointment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticalTestAppointment" ADD CONSTRAINT "PracticalTestAppointment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticalTestAppointment" ADD CONSTRAINT "PracticalTestAppointment_analystUserId_fkey" FOREIGN KEY ("analystUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticalTestEvaluation" ADD CONSTRAINT "PracticalTestEvaluation_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "PracticalTestAppointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
