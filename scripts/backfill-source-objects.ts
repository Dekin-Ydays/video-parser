/**
 * One-shot migration: link legacy `Video` rows that have pose frames but no
 * MinIO source-video pointer back to their original upload.
 *
 * Why: the `bucket`/`objectKey`/`mimeType` columns on `Video` were added
 * after the first wave of recordings landed, so older rows return 404 from
 * `GET /pose/video/:id/source` even though the bytes are still sitting in
 * MinIO under `uploads/<sourceId>/*`. We never stored the linkage at the
 * time, so the only reliable correlation is timing: a Video created ~within
 * a few seconds of an `uploads/*` object's `LastModified` is the same job.
 *
 * Usage (defaults to dry-run):
 *   pnpm exec ts-node scripts/backfill-source-objects.ts          # report
 *   pnpm exec ts-node scripts/backfill-source-objects.ts --apply  # commit
 *
 * Environment variables (read from process.env, not Nest config):
 *   MINIO_ENDPOINT, MINIO_BUCKET, MINIO_ACCESS_KEY, MINIO_SECRET_KEY,
 *   MINIO_REGION, DATABASE_URL
 */
import {
  ListObjectsV2Command,
  S3Client,
  type _Object,
} from '@aws-sdk/client-s3';
import { PrismaClient } from '../src/generated/client/client';

interface Args {
  apply: boolean;
  toleranceSeconds: number;
}

function parseArgs(argv: string[]): Args {
  return {
    apply: argv.includes('--apply'),
    toleranceSeconds: 30,
  };
}

function mimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  return 'application/octet-stream';
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const bucket = process.env.MINIO_BUCKET ?? 'videos';
  const endpoint = process.env.MINIO_ENDPOINT ?? 'http://localhost:9000';

  console.log(
    `[backfill] mode=${args.apply ? 'APPLY' : 'dry-run'} bucket=${bucket} endpoint=${endpoint}`,
  );

  const s3 = new S3Client({
    endpoint,
    region: process.env.MINIO_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
      secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
    },
    forcePathStyle: true,
  });
  // The generated PrismaClient constructor's typings demand a non-empty
  // options object even though the runtime accepts an empty config.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma = new (PrismaClient as any)();

  try {
    // 1. Pull every `uploads/*` object, paginated.
    const objects: _Object[] = [];
    let continuationToken: string | undefined;
    do {
      const page = await s3.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: 'uploads/',
          ContinuationToken: continuationToken,
        }),
      );
      objects.push(...(page.Contents ?? []));
      continuationToken = page.IsTruncated
        ? page.NextContinuationToken
        : undefined;
    } while (continuationToken);

    const usedKeys = new Set(
      (
        await prisma.video.findMany({
          where: { objectKey: { not: null } },
          select: { objectKey: true },
        })
      )
        .map((v) => v.objectKey)
        .filter((k): k is string => k !== null),
    );

    const candidates = objects.filter((o) => o.Key && !usedKeys.has(o.Key));
    console.log(
      `[backfill] found ${objects.length} uploads/* object(s); ${candidates.length} not yet linked`,
    );

    // 2. Pull every Video without an objectKey, sorted by createdAt.
    const orphans = await prisma.video.findMany({
      where: { objectKey: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, createdAt: true, frameCount: true },
    });
    console.log(
      `[backfill] found ${orphans.length} Video row(s) without a source-object link`,
    );

    let linked = 0;
    let skippedAmbiguous = 0;
    let skippedNoMatch = 0;

    for (const video of orphans) {
      const lo = video.createdAt.getTime() - args.toleranceSeconds * 1000;
      const hi = video.createdAt.getTime() + args.toleranceSeconds * 1000;
      const matches = candidates.filter((o) => {
        const t = o.LastModified?.getTime();
        return t !== undefined && t >= lo && t <= hi;
      });

      if (matches.length === 0) {
        skippedNoMatch++;
        console.log(
          `[backfill] video ${video.id} (${video.createdAt.toISOString()}): no candidate within ±${args.toleranceSeconds}s`,
        );
        continue;
      }
      if (matches.length > 1) {
        skippedAmbiguous++;
        console.log(
          `[backfill] video ${video.id} (${video.createdAt.toISOString()}): ${matches.length} candidates, skipping`,
        );
        continue;
      }

      const obj = matches[0];
      if (!obj.Key) {
        skippedNoMatch++;
        continue;
      }
      const fileName = obj.Key.split('/').pop() ?? '';
      const mimeType = mimeFromName(fileName);
      console.log(
        `[backfill] video ${video.id} → ${obj.Key} (${mimeType}, ${obj.Size ?? '?'} bytes)`,
      );

      if (args.apply) {
        await prisma.video.update({
          where: { id: video.id },
          data: {
            bucket,
            objectKey: obj.Key,
            mimeType,
            storageKind: 'MINIO_OBJECT',
          },
        });
      }
      linked++;
      // Don't reuse the same object for two Videos in a single run.
      const idx = candidates.indexOf(obj);
      if (idx >= 0) candidates.splice(idx, 1);
    }

    console.log(
      `[backfill] done linked=${linked} skippedAmbiguous=${skippedAmbiguous} skippedNoMatch=${skippedNoMatch} mode=${
        args.apply ? 'applied' : 'dry-run (re-run with --apply to commit)'
      }`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[backfill] error:', err);
  process.exit(1);
});
