import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '../generated/client/client';
import { PoseFrame } from './types/pose.types';

export interface StoredPoseFrameRecord {
  data: unknown;
}

export interface StoredPoseVideoRecord {
  frames: StoredPoseFrameRecord[];
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
    await this.prisma.frame.create({
      data: {
        videoId,
        data: frame as unknown as Prisma.InputJsonValue,
      },
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

  async listVideos(): Promise<
    Array<{
      id: string;
      startTime: Date;
      endTime: Date | null;
      frameCount: number;
      duration: number | null;
    }>
  > {
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
          orderBy: { createdAt: 'asc' },
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
}
