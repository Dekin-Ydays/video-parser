-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "role" TEXT NOT NULL DEFAULT 'SESSION',
    "storageKind" TEXT NOT NULL DEFAULT 'POSE_ONLY',
    "ownerId" TEXT,
    "bucket" TEXT,
    "objectKey" TEXT,
    "mimeType" TEXT,
    "durationMs" INTEGER,
    "thumbnailObjectKey" TEXT,
    "metadata" JSONB,
    "startTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "frameCount" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Frame" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "videoId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Frame_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ComparisonResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "referenceVideoId" TEXT NOT NULL,
    "comparisonVideoId" TEXT NOT NULL,
    "overallScore" REAL NOT NULL,
    "positionScore" REAL NOT NULL,
    "angularScore" REAL NOT NULL,
    "timingScore" REAL NOT NULL,
    "frameScores" JSONB NOT NULL,
    "breakdown" JSONB NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComparisonResult_referenceVideoId_fkey" FOREIGN KEY ("referenceVideoId") REFERENCES "Video" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ComparisonResult_comparisonVideoId_fkey" FOREIGN KEY ("comparisonVideoId") REFERENCES "Video" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Video_objectKey_key" ON "Video"("objectKey");

-- CreateIndex
CREATE INDEX "ComparisonResult_referenceVideoId_idx" ON "ComparisonResult"("referenceVideoId");

-- CreateIndex
CREATE INDEX "ComparisonResult_comparisonVideoId_idx" ON "ComparisonResult"("comparisonVideoId");

-- CreateIndex
CREATE INDEX "ComparisonResult_referenceVideoId_comparisonVideoId_createdAt_idx" ON "ComparisonResult"("referenceVideoId", "comparisonVideoId", "createdAt");
