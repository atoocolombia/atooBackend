-- AlterTable
ALTER TABLE "ClientBillingExtra" ADD COLUMN "totalServiceCop" INTEGER,
ADD COLUMN "deferInstallmentsTotal" INTEGER,
ADD COLUMN "deferInstallmentsRemaining" INTEGER;

-- AlterTable
ALTER TABLE "ClientServiceOffer" ADD COLUMN "deferMonths" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "ClientBillingPeriod" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "baseInstallmentCop" INTEGER NOT NULL,
    "baseInstallmentLabel" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "extrasSubtotalCop" INTEGER NOT NULL,
    "totalDueCop" INTEGER NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientBillingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientBillingPeriod_userId_year_month_key" ON "ClientBillingPeriod"("userId", "year", "month");

-- CreateIndex
CREATE INDEX "ClientBillingPeriod_userId_year_month_idx" ON "ClientBillingPeriod"("userId", "year", "month");

-- AddForeignKey
ALTER TABLE "ClientBillingPeriod" ADD CONSTRAINT "ClientBillingPeriod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
