-- AlterTable
ALTER TABLE "ClientBillingPeriod" ADD COLUMN "workshopLines" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "ClientBillingPeriod" ADD COLUMN "workshopSubtotalCop" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ClientWorkshopPaymentPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "suggestionId" TEXT,
    "workshopName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "totalCostCop" INTEGER NOT NULL,
    "monthlyChargeCop" INTEGER NOT NULL,
    "deferMonths" INTEGER NOT NULL DEFAULT 1,
    "installmentsTotal" INTEGER NOT NULL DEFAULT 1,
    "installmentsRemaining" INTEGER NOT NULL DEFAULT 1,
    "billingStartYear" INTEGER NOT NULL,
    "billingStartMonth" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientWorkshopPaymentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientWorkshopPaymentPlan_suggestionId_key" ON "ClientWorkshopPaymentPlan"("suggestionId");

-- CreateIndex
CREATE INDEX "ClientWorkshopPaymentPlan_userId_active_idx" ON "ClientWorkshopPaymentPlan"("userId", "active");

-- AddForeignKey
ALTER TABLE "ClientWorkshopPaymentPlan" ADD CONSTRAINT "ClientWorkshopPaymentPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
