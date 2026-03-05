import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '../generated/client/client';
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
  constructor(private readonly prisma: PrismaService) {}

  async createVideo(startTime = new Date()): Promise<string> {
    const video = await this.prisma.video.create({
      data: { startTime },
      select: { id: true },
    });
    return video.id;
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
    await this.prisma.video.update({
      where: { id: videoId },
      data: { endTime },
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

      return {
        id: video.id,
        startTime: video.startTime,
        endTime: video.endTime,
        frameCount: video._count.frames,
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

    if (!video) {
      return null;
    }

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
