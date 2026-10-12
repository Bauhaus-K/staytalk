-- pgvector for optional semantic knowledge search.
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "KnowledgeItem" ADD COLUMN     "embedding" vector(1024),
ADD COLUMN     "embeddingModel" TEXT;


-- No ANN index: per-property knowledge bases are small (tens to hundreds of
-- rows), so an exact scan filtered by property is fast and precise.
