-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING_DOCUMENTS', 'DOCUMENTS_SENT', 'DOCUMENTS_SIGNED', 'IN_DELIVERY', 'AWAITING_CLIENT_CONFIRMATION', 'COMPLETED');

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleDelivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "applicationId" TEXT,
    "advisorUserId" TEXT,
    "clientName" TEXT NOT NULL,
    "idDocumentNumber" TEXT NOT NULL,
    "address" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "deliveryLocation" TEXT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING_DOCUMENTS',
    "contractSentAt" TIMESTAMP(3),
    "contractSignedAt" TIMESTAMP(3),
    "insuranceSentAt" TIMESTAMP(3),
    "insuranceSignedAt" TIMESTAMP(3),
    "promissoryNoteSentAt" TIMESTAMP(3),
    "promissoryNoteSignedAt" TIMESTAMP(3),
    "vin" TEXT,
    "taxPayment" TEXT,
    "soatPayment" TEXT,
    "platesChassisDecl" TEXT,
    "engineNumber" TEXT,
    "serialNumber" TEXT,
    "axles" TEXT,
    "pbvKg" TEXT,
    "color" TEXT,
    "fuelType" TEXT,
    "vehicleClass" TEXT,
    "brand" TEXT,
    "line" TEXT,
    "model" TEXT,
    "bodyType" TEXT,
    "passengerCapacity" TEXT,
    "displacement" TEXT,
    "accessoryChecklist" JSONB,
    "completedByAdvisorAt" TIMESTAMP(3),
    "clientConfirmedAt" TIMESTAMP(3),
    "confirmationToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Application_userId_key" ON "Application"("userId");

-- CreateIndex
CREATE INDEX "Application_status_submittedAt_idx" ON "Application"("status", "submittedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "VehicleDelivery_applicationId_key" ON "VehicleDelivery"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleDelivery_confirmationToken_key" ON "VehicleDelivery"("confirmationToken");

-- CreateIndex
CREATE INDEX "VehicleDelivery_status_createdAt_idx" ON "VehicleDelivery"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "VehicleDelivery_advisorUserId_idx" ON "VehicleDelivery"("advisorUserId");

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleDelivery" ADD CONSTRAINT "VehicleDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleDelivery" ADD CONSTRAINT "VehicleDelivery_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleDelivery" ADD CONSTRAINT "VehicleDelivery_advisorUserId_fkey" FOREIGN KEY ("advisorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
