CREATE TABLE "UserApplicationKnowledgeTest" (
    "userId" TEXT NOT NULL,
    "includeEvSection" BOOLEAN NOT NULL,
    "evScore" DOUBLE PRECISION,
    "vialScore" DOUBLE PRECISION NOT NULL,
    "customerServiceScore" DOUBLE PRECISION NOT NULL,
    "weightedScore" DOUBLE PRECISION NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserApplicationKnowledgeTest_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "UserApplicationKnowledgeTest" ADD CONSTRAINT "UserApplicationKnowledgeTest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
