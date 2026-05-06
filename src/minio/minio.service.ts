import { randomUUID } from 'node:crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { PoseFrame } from '../pose/types/pose.types';

function describeError(err: unknown): string {
  if (!err) return 'unknown error';
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    const aggregate = (err as { errors?: unknown[] }).errors;
    if (Array.isArray(aggregate) && aggregate.length > 0) {
      const inner = aggregate[0];
      if (inner instanceof Error) {
        const innerCode = (inner as NodeJS.ErrnoException).code;
        return innerCode
          ? `${innerCode} (${inner.message || 'connection failed'})`
          : inner.message || String(inner);
      }
    }
    if (err.message) return code ? `${code}: ${err.message}` : err.message;
    if (code) return code;
  }
  return String(err);
}

export interface StoredVideo {
  id: string;
  startTime: string;
  endTime: string;
  frames: PoseFrame[];
}

export interface UploadedSourceVideo {
  id: string;
  objectKey: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

export interface StorageStatus {
  ready: boolean;
  endpoint: string;
  bucket: string;
  error?: string;
}

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;
  private ready = false;
  private lastError: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.bucket = config.get<string>('MINIO_BUCKET', 'videos');
    this.endpoint = config.get<string>(
      'MINIO_ENDPOINT',
      'http://localhost:9000',
    );
    this.client = new S3Client({
      endpoint: this.endpoint,
      region: config.get<string>('MINIO_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: config.get<string>('MINIO_ACCESS_KEY', 'minioadmin'),
        secretAccessKey: config.get<string>('MINIO_SECRET_KEY', 'minioadmin'),
      },
      forcePathStyle: true,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.initStorage();
  }

  getStatus(): StorageStatus {
    return {
      ready: this.ready,
      endpoint: this.endpoint,
      bucket: this.bucket,
      error: this.lastError,
    };
  }

  async uploadVideo(video: StoredVideo): Promise<void> {
    await this.requireReady();
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: `videos/${video.id}/video.json`,
        Body: JSON.stringify(video),
        ContentType: 'application/json',
      }),
    );
    this.logger.debug(
      `Uploaded video ${video.id} (${video.frames.length} frames)`,
    );
  }

  async uploadSourceVideo(params: {
    body: Buffer;
    fileName: string;
    mimeType: string;
    size: number;
  }): Promise<UploadedSourceVideo> {
    await this.requireReady();
    const id = randomUUID();
    const uploadedAt = new Date().toISOString();
    const fileName = this.sanitizeFileName(params.fileName);
    const objectKey = `uploads/${id}/${fileName}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: params.body,
        ContentLength: params.size,
        ContentType: params.mimeType,
        Metadata: {
          originalName: params.fileName,
          uploadedAt,
        },
      }),
    );

    this.logger.debug(
      `Uploaded source video ${id} (${params.size} bytes, ${params.mimeType})`,
    );

    return {
      id,
      objectKey,
      fileName,
      mimeType: params.mimeType,
      size: params.size,
      uploadedAt,
    };
  }

  /**
   * Stream a source-video object back to the caller. Returns the raw S3
   * Body (typically a `Readable`) plus content metadata. Returns null if
   * the object is not found.
   */
  async streamSourceVideo(objectKey: string): Promise<{
    body: NodeJS.ReadableStream;
    contentType: string;
    contentLength?: number;
  } | null> {
    await this.requireReady();
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
        }),
      );
      if (!response.Body) return null;
      return {
        body: response.Body as unknown as NodeJS.ReadableStream,
        contentType: response.ContentType ?? 'application/octet-stream',
        contentLength: response.ContentLength,
      };
    } catch (err) {
      const status =
        (err as { $metadata?: { httpStatusCode?: number } })?.$metadata
          ?.httpStatusCode;
      if (status === 404) return null;
      throw err;
    }
  }

  async downloadVideo(videoId: string): Promise<StoredVideo | null> {
    if (!this.ready && !(await this.initStorage())) {
      return null;
    }
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: `videos/${videoId}/video.json`,
        }),
      );
      const body = await response.Body?.transformToString();
      if (!body) return null;
      return JSON.parse(body) as StoredVideo;
    } catch {
      return null;
    }
  }

  private async requireReady(): Promise<void> {
    if (this.ready) return;
    const ok = await this.initStorage();
    if (!ok) {
      throw new Error(
        `Object storage at ${this.endpoint} is unreachable: ${this.lastError ?? 'unknown error'}`,
      );
    }
  }

  private async initStorage(): Promise<boolean> {
    try {
      await this.ensureBucketExists();
      if (!this.ready) {
        this.logger.log(
          `Object storage ready at ${this.endpoint} (bucket: ${this.bucket})`,
        );
      }
      this.ready = true;
      this.lastError = undefined;
      return true;
    } catch (err) {
      this.ready = false;
      this.lastError = describeError(err);
      this.logger.warn(
        `Object storage unreachable at ${this.endpoint}: ${this.lastError}. ` +
          `Uploads and source-video persistence will fail until MinIO is reachable. ` +
          `Start MinIO with \`docker compose up minio\` from video-parser/.`,
      );
      return false;
    }
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (err) {
      const status =
        (err as { $metadata?: { httpStatusCode?: number } })?.$metadata
          ?.httpStatusCode;
      if (status && status !== 404) throw err;
      this.logger.log(`Creating bucket "${this.bucket}"`);
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  private sanitizeFileName(fileName: string): string {
    const trimmed = fileName.trim();
    if (!trimmed) {
      return 'video.bin';
    }

    const sanitized = trimmed.replace(/[^a-zA-Z0-9._-]/g, '-');
    return sanitized.replace(/-+/g, '-');
  }
}
