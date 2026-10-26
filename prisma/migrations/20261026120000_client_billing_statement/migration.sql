-- CreateEnum
CREATE TYPE "ClientServiceOfferDecisionStatus" AS ENUM ('ACCEPTED', 'DECLINED');

-- CreateTable
CREATE TABLE "ClientBillingExtra" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'service',
    "amountCop" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientBillingExtra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientServiceOffer" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bannerTitle" TEXT NOT NULL,
    "bannerSubtitle" TEXT,
    "detailBody" TEXT NOT NULL,
    "extraItems" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientServiceOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientServiceOfferDecision" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ClientServiceOfferDecisionStatus" NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientServiceOfferDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientBillingExtra_userId_active_idx" ON "ClientBillingExtra"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ClientServiceOfferDecision_userId_offerId_key" ON "ClientServiceOfferDecision"("userId", "offerId");

-- CreateIndex
CREATE INDEX "ClientServiceOfferDecision_userId_idx" ON "ClientServiceOfferDecision"("userId");

-- AddForeignKey
ALTER TABLE "ClientBillingExtra" ADD CONSTRAINT "ClientBillingExtra_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientServiceOfferDecision" ADD CONSTRAINT "ClientServiceOfferDecision_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "ClientServiceOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientServiceOfferDecision" ADD CONSTRAINT "ClientServiceOfferDecision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
