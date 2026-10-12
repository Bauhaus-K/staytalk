-- CreateEnum
CREATE TYPE "UsageKind" AS ENUM ('AGENT', 'TRANSLATION', 'LANGUAGE_DETECTION');

-- AlterTable
ALTER TABLE "Escalation" ADD COLUMN     "knowledgeDismissedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LlmUsage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "conversationId" TEXT,
    "kind" "UsageKind" NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicroUsd" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "externalId" TEXT,
    "secretEncrypted" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LlmUsage_organizationId_propertyId_createdAt_idx" ON "LlmUsage"("organizationId", "propertyId", "createdAt");

-- CreateIndex
CREATE INDEX "LlmUsage_conversationId_idx" ON "LlmUsage"("conversationId");

-- CreateIndex
CREATE INDEX "ChannelConnection_organizationId_idx" ON "ChannelConnection"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelConnection_propertyId_channel_key" ON "ChannelConnection"("propertyId", "channel");

-- AddForeignKey
ALTER TABLE "LlmUsage" ADD CONSTRAINT "LlmUsage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LlmUsage" ADD CONSTRAINT "LlmUsage_propertyId_organizationId_fkey" FOREIGN KEY ("propertyId", "organizationId") REFERENCES "Property"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LlmUsage" ADD CONSTRAINT "LlmUsage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelConnection" ADD CONSTRAINT "ChannelConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelConnection" ADD CONSTRAINT "ChannelConnection_propertyId_organizationId_fkey" FOREIGN KEY ("propertyId", "organizationId") REFERENCES "Property"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

