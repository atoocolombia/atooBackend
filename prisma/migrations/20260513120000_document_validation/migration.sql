-- CreateEnum
CREATE TYPE "DocumentValidationStatus" AS ENUM ('PENDING', 'VALIDATED', 'REJECTED');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "documentKind" TEXT;
ALTER TABLE "Document" ADD COLUMN "validationStatus" "DocumentValidationStatus" NOT NULL DEFAULT 'PENDING';

UPDATE "Document" SET "documentKind" = 'migrated_' || "id" WHERE "documentKind" IS NULL;

ALTER TABLE "Document" ALTER COLUMN "documentKind" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Document_userId_documentKind_key" ON "Document"("userId", "documentKind");
