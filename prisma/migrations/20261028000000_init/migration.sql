-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "VideoRole" AS ENUM ('SESSION', 'REFERENCE', 'ATTEMPT');

-- CreateEnum
CREATE TYPE "VideoStorageKind" AS ENUM ('POSE_ONLY', 'MINIO_OBJECT');

-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "role" "VideoRole" NOT NULL DEFAULT 'SESSION',
    "storageKind" "VideoStorageKind" NOT NULL DEFAULT 'POSE_ONLY',
    "ownerId" TEXT,
    "bucket" TEXT,
    "objectKey" TEXT,
    "mimeType" TEXT,
    "durationMs" INTEGER,
    "thumbnailObjectKey" TEXT,
    "metadata" JSONB,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "frameCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Frame" (
    "id" SERIAL NOT NULL,
    "videoId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Frame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComparisonResult" (
    "id" TEXT NOT NULL,
    "referenceVideoId" TEXT NOT NULL,
    "comparisonVideoId" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "positionScore" DOUBLE PRECISION NOT NULL,
    "angularScore" DOUBLE PRECISION NOT NULL,
    "timingScore" DOUBLE PRECISION NOT NULL,
    "frameScores" JSONB NOT NULL,
    "breakdown" JSONB NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComparisonResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionJob" (
    "jobId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "framesProcessed" INTEGER,
    "totalFrames" INTEGER,
    "error" TEXT,
    "at" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtractionJob_pkey" PRIMARY KEY ("jobId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Video_objectKey_key" ON "Video"("objectKey");

-- CreateIndex
CREATE INDEX "ComparisonResult_referenceVideoId_idx" ON "ComparisonResult"("referenceVideoId");

-- CreateIndex
CREATE INDEX "ComparisonResult_comparisonVideoId_idx" ON "ComparisonResult"("comparisonVideoId");

-- CreateIndex
CREATE INDEX "ComparisonResult_referenceVideoId_comparisonVideoId_created_idx" ON "ComparisonResult"("referenceVideoId", "comparisonVideoId", "createdAt");

-- AddForeignKey
ALTER TABLE "Frame" ADD CONSTRAINT "Frame_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComparisonResult" ADD CONSTRAINT "ComparisonResult_referenceVideoId_fkey" FOREIGN KEY ("referenceVideoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComparisonResult" ADD CONSTRAINT "ComparisonResult_comparisonVideoId_fkey" FOREIGN KEY ("comparisonVideoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

