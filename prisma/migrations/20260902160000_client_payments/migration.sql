-- CreateTable
CREATE TABLE "ClientPayment" (
    "id" TEXT NOT NULL,
    "idDocumentNumber" TEXT NOT NULL,
    "amountCop" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "registeredByUserId" TEXT NOT NULL,
    "userId" TEXT,
    "clientName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientPayment_idDocumentNumber_paidAt_idx" ON "ClientPayment"("idDocumentNumber", "paidAt" DESC);

-- CreateIndex
CREATE INDEX "ClientPayment_paidAt_idx" ON "ClientPayment"("paidAt" DESC);

-- CreateIndex
CREATE INDEX "ClientPayment_registeredByUserId_idx" ON "ClientPayment"("registeredByUserId");

-- AddForeignKey
ALTER TABLE "ClientPayment" ADD CONSTRAINT "ClientPayment_registeredByUserId_fkey" FOREIGN KEY ("registeredByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPayment" ADD CONSTRAINT "ClientPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
