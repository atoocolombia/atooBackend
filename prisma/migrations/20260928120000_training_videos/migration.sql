-- CreateEnum
CREATE TYPE "TrainingVideoKind" AS ENUM ('MANDATORY', 'OPTIONAL');

-- CreateEnum
CREATE TYPE "TrainingPurchaseStatus" AS ENUM ('PENDING', 'APPROVED');

-- CreateTable
CREATE TABLE "TrainingVideo" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" "TrainingVideoKind" NOT NULL,
    "priceCop" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "storedPath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "originalName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trainingVideoId" TEXT NOT NULL,
    "amountCop" INTEGER NOT NULL,
    "status" "TrainingPurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingVideo_published_sortOrder_idx" ON "TrainingVideo"("published", "sortOrder");

-- CreateIndex
CREATE INDEX "TrainingVideo_kind_published_idx" ON "TrainingVideo"("kind", "published");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingPurchase_userId_trainingVideoId_key" ON "TrainingPurchase"("userId", "trainingVideoId");

-- CreateIndex
CREATE INDEX "TrainingPurchase_trainingVideoId_status_idx" ON "TrainingPurchase"("trainingVideoId", "status");

-- AddForeignKey
ALTER TABLE "TrainingPurchase" ADD CONSTRAINT "TrainingPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPurchase" ADD CONSTRAINT "TrainingPurchase_trainingVideoId_fkey" FOREIGN KEY ("trainingVideoId") REFERENCES "TrainingVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
