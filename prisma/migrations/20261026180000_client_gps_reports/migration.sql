-- CreateTable
CREATE TABLE "ClientGpsReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "plate" TEXT,
    "vin" TEXT,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "totalDistanceKm" DOUBLE PRECISION,
    "tripPointsCount" INTEGER,
    "avgSpeedKmh" DOUBLE PRECISION,
    "maxSpeedKmh" DOUBLE PRECISION,
    "lastLocation" TEXT,
    "lastLatitude" DOUBLE PRECISION,
    "lastLongitude" DOUBLE PRECISION,
    "lastReportAt" TIMESTAMP(3),
    "highlights" JSONB NOT NULL DEFAULT '[]',
    "samplePoints" JSONB NOT NULL DEFAULT '[]',
    "parseWarnings" JSONB NOT NULL DEFAULT '[]',
    "analystNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientGpsReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientGpsReport_userId_createdAt_idx" ON "ClientGpsReport"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ClientGpsReport_uploadedByUserId_idx" ON "ClientGpsReport"("uploadedByUserId");

-- AddForeignKey
ALTER TABLE "ClientGpsReport" ADD CONSTRAINT "ClientGpsReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientGpsReport" ADD CONSTRAINT "ClientGpsReport_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
