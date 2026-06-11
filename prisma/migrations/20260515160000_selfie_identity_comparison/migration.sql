-- AlterTable
ALTER TABLE "UserIdentityExtraction" ADD COLUMN "identityPhotoDocumentId" TEXT;
ALTER TABLE "UserIdentityExtraction" ADD COLUMN "selfieMatchesIdentityPerson" BOOLEAN;
ALTER TABLE "UserIdentityExtraction" ADD COLUMN "selfieIsDistinctCaptureFromIdentity" BOOLEAN;
