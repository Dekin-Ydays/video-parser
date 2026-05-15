CREATE TABLE "ExtractionJob" (
    "jobId" TEXT NOT NULL PRIMARY KEY,
    "phase" TEXT NOT NULL,
    "framesProcessed" INTEGER,
    "totalFrames" INTEGER,
    "error" TEXT,
    "at" BIGINT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
