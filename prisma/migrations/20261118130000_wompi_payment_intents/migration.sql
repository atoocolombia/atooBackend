CREATE TYPE "WompiPaymentKind" AS ENUM ('DEPOSIT', 'INSTALLMENT');

CREATE TYPE "WompiPaymentIntentStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'ERROR', 'VOIDED');

CREATE TABLE "WompiPaymentIntent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "WompiPaymentKind" NOT NULL,
    "amountCop" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "WompiPaymentIntentStatus" NOT NULL DEFAULT 'PENDING',
    "wompiTransactionId" TEXT,
    "clientPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WompiPaymentIntent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WompiPaymentIntent_reference_key" ON "WompiPaymentIntent"("reference");
CREATE INDEX "WompiPaymentIntent_userId_status_idx" ON "WompiPaymentIntent"("userId", "status");
CREATE INDEX "WompiPaymentIntent_reference_idx" ON "WompiPaymentIntent"("reference");

ALTER TABLE "WompiPaymentIntent" ADD CONSTRAINT "WompiPaymentIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;