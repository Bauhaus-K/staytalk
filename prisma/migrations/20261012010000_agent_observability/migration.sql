-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "citedKnowledgeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "outcome" TEXT;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "isTest" BOOLEAN NOT NULL DEFAULT false;

