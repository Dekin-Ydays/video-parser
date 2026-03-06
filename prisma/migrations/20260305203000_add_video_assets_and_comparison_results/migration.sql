-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Video" (
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
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Video" (
    "id",
    "startTime",
    "endTime",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "startTime",
    "endTime",
    "startTime",
    CURRENT_TIMESTAMP
FROM "Video";
DROP TABLE "Video";
ALTER TABLE "new_Video" RENAME TO "Video";
CREATE UNIQUE INDEX "Video_objectKey_key" ON "Video"("objectKey");
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
CREATE INDEX "ComparisonResult_referenceVideoId_idx" ON "ComparisonResult"("referenceVideoId");
CREATE INDEX "ComparisonResult_comparisonVideoId_idx" ON "ComparisonResult"("comparisonVideoId");
CREATE INDEX "ComparisonResult_referenceVideoId_comparisonVideoId_createdAt_idx" ON "ComparisonResult"("referenceVideoId", "comparisonVideoId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
