-- CreateEnum
CREATE TYPE "CatalogVehicleType" AS ENUM ('CARRO', 'CAMIONETA');

-- CreateTable
CREATE TABLE "LandingSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "maxVisibleVehicles" INTEGER NOT NULL DEFAULT 10,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogVehicle" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL,
    "type" "CatalogVehicleType" NOT NULL,
    "highlights" JSONB NOT NULL,
    "features" JSONB NOT NULL,
    "specs" JSONB NOT NULL,
    "badge" TEXT,
    "popular" BOOLEAN NOT NULL DEFAULT false,
    "weeklyPriceCop" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "specSheetPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogVehicleImage" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "storedPath" TEXT,
    "publicUrl" TEXT,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogVehicleImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogVehicle_slug_key" ON "CatalogVehicle"("slug");

-- CreateIndex
CREATE INDEX "CatalogVehicleImage_vehicleId_idx" ON "CatalogVehicleImage"("vehicleId");

-- AddForeignKey
ALTER TABLE "CatalogVehicleImage" ADD CONSTRAINT "CatalogVehicleImage_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "CatalogVehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
