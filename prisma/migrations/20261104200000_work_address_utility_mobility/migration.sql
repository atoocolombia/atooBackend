-- AlterTable
ALTER TABLE "UserWorkAddressExtraction" ADD COLUMN "utilityDwellingType" TEXT;
ALTER TABLE "UserWorkAddressExtraction" ADD COLUMN "utilityAddressComplement" TEXT;
ALTER TABLE "UserWorkAddressExtraction" ADD COLUMN "utilityBillHolderMatchesApplicant" BOOLEAN;
ALTER TABLE "UserWorkAddressExtraction" ADD COLUMN "mobilityDrivenElectricVehicle" BOOLEAN;
