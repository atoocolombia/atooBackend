-- CreateTable
CREATE TABLE "UserIdentityExtraction" (
    "userId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "birthDate" TEXT,
    "idDocumentNumber" TEXT,
    "licenseMatchesCedula" BOOLEAN,
    "licenseValidUntil" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserIdentityExtraction_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "UserIdentityExtraction" ADD CONSTRAINT "UserIdentityExtraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
