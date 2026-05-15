import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '../generated/client/client';
import { MinioService } from '../minio/minio.service';
import { PoseFrame } from './types/pose.types';
import { ScoringResult } from './comparator';

export interface StoredPoseFrameRecord {
  data: unknown;
}

export interface StoredVideoSummaryRecord {
  id: string;
  startTime: Date;
  endTime: Date | null;
  frameCount: number;
  duration: number | null;
}

export interface StoredPoseVideoRecord {
  frames: StoredPoseFrameRecord[];
}

export interface CreateComparisonResultInput {
  referenceVideoId: string;
  comparisonVideoId: string;
  result: ScoringResult;
  algorithmVersion: string;
}

@Injectable()
export class PoseVideoRepository {
  private readonly logger = new Logger(PoseVideoRepository.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly minio: MinioService,
  ) {}

  async createVideo(startTime = new Date()): Promise<string> {
    const video = await this.prisma.video.create({
      data: { startTime },
      select: { id: true },
    });
    return video.id;
  }

  async setSourceObject(
    videoId: string,
    source: { bucket: string; objectKey: string; mimeType: string },
  ): Promise<void> {
    await this.prisma.video.update({
      where: { id: videoId },
      data: {
        bucket: source.bucket,
        objectKey: source.objectKey,
        mimeType: source.mimeType,
        storageKind: 'MINIO_OBJECT',
      },
    });
  }

  async getSourceObject(
    videoId: string,
  ): Promise<{ bucket: string; objectKey: string; mimeType: string } | null> {
    const row = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { bucket: true, objectKey: true, mimeType: true },
    });
    if (!row || !row.bucket || !row.objectKey) return null;
    return {
      bucket: row.bucket,
      objectKey: row.objectKey,
      mimeType: row.mimeType ?? 'application/octet-stream',
    };
  }

  async createFrame(videoId: string, frame: PoseFrame): Promise<void> {
    await this.createFrames(videoId, [frame]);
  }

  async createFrames(videoId: string, frames: PoseFrame[]): Promise<void> {
    if (frames.length === 0) {
      return;
    }

    await this.prisma.frame.createMany({
      data: frames.map((frame) => ({
        videoId,
        data: frame as unknown as Prisma.InputJsonValue,
      })),
    });
  }

  async countFrames(videoId: string): Promise<number> {
    return this.prisma.frame.count({
      where: { videoId },
    });
  }

  async deleteVideo(videoId: string): Promise<void> {
    await this.prisma.video.delete({
      where: { id: videoId },
    });
  }

  async endVideo(videoId: string, endTime = new Date()): Promise<void> {
    const video = await this.prisma.video.findUniqueOrThrow({
      where: { id: videoId },
      include: {
        frames: {
          orderBy: { createdAt: 'asc' },
          select: { data: true },
        },
      },
    });

    const frames = video.frames.map((f) => f.data as unknown as PoseFrame);

    try {
      await this.minio.uploadVideo({
        id: videoId,
        startTime: video.startTime.toISOString(),
        endTime: endTime.toISOString(),
        frames,
      });
    } catch (error) {
      this.logger.warn(
        `Pose export failed for videoId=${videoId}; keeping DB frames as source of truth`,
        error,
      );
    }

    await this.prisma.video.update({
      where: { id: videoId },
      data: { endTime, frameCount: frames.length },
    });
  }

  async completeVideoFromStoredFrames(
    videoId: string,
    frameCount: number,
    endTime = new Date(),
  ): Promise<void> {
    await this.prisma.video.update({
      where: { id: videoId },
      data: { endTime, frameCount },
    });
  }

  async getFramesByVideoId(videoId: string): Promise<StoredPoseFrameRecord[]> {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      include: {
        frames: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { data: true },
        },
      },
    });

    if (!video) {
      return [];
    }

    return video.frames.map((frame) => ({ data: frame.data }));
  }

  async updateVideoFrameCount(videoId: string): Promise<void> {
    const count = await this.countFrames(videoId);
    await this.prisma.video.update({
      where: { id: videoId },
      data: { frameCount: count },
    });
  }

  async listVideos(): Promise<StoredVideoSummaryRecord[]> {
    const videos = await this.prisma.video.findMany({
      include: {
        _count: {
          select: { frames: true },
        },
      },
      orderBy: { startTime: 'desc' },
    });

    return videos.map((video) => {
      const duration = video.endTime
        ? video.endTime.getTime() - video.startTime.getTime()
        : null;

      const frameCount = video.endTime ? video.frameCount : video._count.frames;

      return {
        id: video.id,
        startTime: video.startTime,
        endTime: video.endTime,
        frameCount,
        duration,
      };
    });
  }

  async getVideoById(videoId: string): Promise<StoredPoseVideoRecord | null> {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      include: {
        frames: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { data: true },
        },
      },
    });

    if (!video) return null;
    return {
      frames: video.frames.map((frame) => ({ data: frame.data })),
    };
  }

  async createComparisonResult({
    referenceVideoId,
    comparisonVideoId,
    result,
    algorithmVersion,
  }: CreateComparisonResultInput): Promise<string> {
    const comparison = await this.prisma.comparisonResult.create({
      data: {
        referenceVideoId,
        comparisonVideoId,
        overallScore: result.overallScore,
        positionScore: result.breakdown.positionScore,
        angularScore: result.breakdown.angularScore,
        timingScore: result.breakdown.timingScore,
        frameScores: this.toJsonValue(result.frameScores),
        breakdown: this.toJsonValue(result.breakdown),
        algorithmVersion,
      },
      select: { id: true },
    });

    return comparison.id;
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
