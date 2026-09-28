-- CreateEnum
CREATE TYPE "SupportChatSessionStatus" AS ENUM ('AI', 'HUMAN_REQUESTED', 'HUMAN_ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportChatMessageRole" AS ENUM ('USER', 'BOT', 'AGENT');

-- CreateTable
CREATE TABLE "SupportChatSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topic" INTEGER,
    "status" "SupportChatSessionStatus" NOT NULL DEFAULT 'AI',
    "handoffAt" TIMESTAMP(3),
    "humanNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "SupportChatMessageRole" NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportChatSession_userId_updatedAt_idx" ON "SupportChatSession"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "SupportChatSession_status_updatedAt_idx" ON "SupportChatSession"("status", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "SupportChatMessage_sessionId_createdAt_idx" ON "SupportChatMessage"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "SupportChatSession" ADD CONSTRAINT "SupportChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportChatMessage" ADD CONSTRAINT "SupportChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SupportChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
