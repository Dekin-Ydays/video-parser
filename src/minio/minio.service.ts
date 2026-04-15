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

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = config.get<string>('MINIO_BUCKET', 'videos');
    this.client = new S3Client({
      endpoint: config.get<string>('MINIO_ENDPOINT', 'http://localhost:9000'),
      region: config.get<string>('MINIO_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: config.get<string>('MINIO_ACCESS_KEY', 'minioadmin'),
        secretAccessKey: config.get<string>('MINIO_SECRET_KEY', 'minioadmin'),
      },
      forcePathStyle: true,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBucketExists();
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      this.logger.log(`Creating bucket "${this.bucket}"`);
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async uploadVideo(video: StoredVideo): Promise<void> {
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

  async downloadVideo(videoId: string): Promise<StoredVideo | null> {
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

  private sanitizeFileName(fileName: string): string {
    const trimmed = fileName.trim();
    if (!trimmed) {
      return 'video.bin';
    }

    const sanitized = trimmed.replace(/[^a-zA-Z0-9._-]/g, '-');
    return sanitized.replace(/-+/g, '-');
  }
}
