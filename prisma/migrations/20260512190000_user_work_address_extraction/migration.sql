-- CreateTable
CREATE TABLE "UserWorkAddressExtraction" (
    "userId" TEXT NOT NULL,
    "utilityServiceAddress" TEXT,
    "bankHolderMatchesIdentity" BOOLEAN,
    "platformCapturesMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserWorkAddressExtraction_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "UserWorkAddressExtraction" ADD CONSTRAINT "UserWorkAddressExtraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
