-- AlterTable
ALTER TABLE "TrainingVideo" ADD COLUMN "youtubeUrl" TEXT;

ALTER TABLE "TrainingVideo" ALTER COLUMN "storedPath" DROP NOT NULL;
ALTER TABLE "TrainingVideo" ALTER COLUMN "mimeType" DROP NOT NULL;
ALTER TABLE "TrainingVideo" ALTER COLUMN "sizeBytes" DROP NOT NULL;
