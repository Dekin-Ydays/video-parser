import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type { ExtractionProgressEvent } from './pose-extraction.service';

type StoredExtractionJob = {
  jobId: string;
  phase: ExtractionProgressEvent['phase'];
  framesProcessed: number | null;
  totalFrames: number | null;
  error: string | null;
  at: bigint | number;
};

@Injectable()
export class PoseExtractionJobRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(event: ExtractionProgressEvent): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO "ExtractionJob" (
        "jobId",
        "phase",
        "framesProcessed",
        "totalFrames",
        "error",
        "at",
        "updatedAt"
      )
      VALUES (
        ${event.jobId},
        ${event.phase},
        ${event.framesProcessed ?? null},
        ${event.totalFrames ?? null},
        ${event.error ?? null},
        ${event.at},
        CURRENT_TIMESTAMP
      )
      ON CONFLICT("jobId") DO UPDATE SET
        "phase" = excluded."phase",
        "framesProcessed" = excluded."framesProcessed",
        "totalFrames" = excluded."totalFrames",
        "error" = excluded."error",
        "at" = excluded."at",
        "updatedAt" = CURRENT_TIMESTAMP
    `;
  }

  async get(jobId: string): Promise<ExtractionProgressEvent | null> {
    const rows = await this.prisma.$queryRaw<StoredExtractionJob[]>`
      SELECT
        "jobId",
        "phase",
        "framesProcessed",
        "totalFrames",
        "error",
        "at"
      FROM "ExtractionJob"
      WHERE "jobId" = ${jobId}
      LIMIT 1
    `;

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      jobId: row.jobId,
      phase: row.phase,
      framesProcessed: row.framesProcessed ?? undefined,
      totalFrames: row.totalFrames ?? undefined,
      error: row.error ?? undefined,
      at: typeof row.at === 'bigint' ? Number(row.at) : row.at,
    };
  }
}
