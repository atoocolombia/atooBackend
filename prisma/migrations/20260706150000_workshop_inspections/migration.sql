-- AlterEnum
ALTER TYPE "UserType" ADD VALUE 'WORKSHOP';

-- CreateEnum
CREATE TYPE "InspectionAppointmentKind" AS ENUM ('BUSINESS_PLANNED', 'CLIENT_REQUESTED');
CREATE TYPE "InspectionAppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Workshop" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "phone" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workshop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkshopAvailabilitySlot" (
    "id" TEXT NOT NULL,
    "workshopId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "maxAppointments" INTEGER NOT NULL,
    "bookedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkshopAvailabilitySlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientVehiclePlan" (
    "userId" TEXT NOT NULL,
    "vehicleName" TEXT NOT NULL,
    "vin" TEXT,
    "deliveredAt" TIMESTAMP(3) NOT NULL,
    "nextInspectionDueAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientVehiclePlan_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "InspectionAppointment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workshopId" TEXT NOT NULL,
    "kind" "InspectionAppointmentKind" NOT NULL,
    "status" "InspectionAppointmentStatus" NOT NULL DEFAULT 'PENDING',
    "appointmentDate" TEXT NOT NULL,
    "appointmentTime" TEXT,
    "reason" TEXT,
    "proofStoredPath" TEXT,
    "proofMimeType" TEXT,
    "proofOriginalName" TEXT,
    "proofSizeBytes" INTEGER,
    "workshopNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workshop_userId_key" ON "Workshop"("userId");

-- CreateIndex
CREATE INDEX "WorkshopAvailabilitySlot_workshopId_date_idx" ON "WorkshopAvailabilitySlot"("workshopId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "WorkshopAvailabilitySlot_workshopId_date_startTime_key" ON "WorkshopAvailabilitySlot"("workshopId", "date", "startTime");

-- CreateIndex
CREATE INDEX "InspectionAppointment_userId_idx" ON "InspectionAppointment"("userId");

-- CreateIndex
CREATE INDEX "InspectionAppointment_workshopId_appointmentDate_idx" ON "InspectionAppointment"("workshopId", "appointmentDate");

-- CreateIndex
CREATE INDEX "InspectionAppointment_workshopId_status_idx" ON "InspectionAppointment"("workshopId", "status");

-- AddForeignKey
ALTER TABLE "Workshop" ADD CONSTRAINT "Workshop_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkshopAvailabilitySlot" ADD CONSTRAINT "WorkshopAvailabilitySlot_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientVehiclePlan" ADD CONSTRAINT "ClientVehiclePlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionAppointment" ADD CONSTRAINT "InspectionAppointment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionAppointment" ADD CONSTRAINT "InspectionAppointment_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
