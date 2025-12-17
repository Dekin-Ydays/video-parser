import { Injectable, Logger } from '@nestjs/common';
import type { PoseFrame } from './pose.types';
import { PrismaService } from '../prisma.service';
import { Prisma } from '../generated/client/client';
import { PoseComparator } from './pose-comparator';
import {
  Video,
  Frame,
  Landmark,
  ScoringResult,
  ComparatorConfig,
} from './pose-comparison.types';

@Injectable()
export class PoseService {
  private readonly logger = new Logger(PoseService.name);
  private readonly latestByClientId = new Map<string, PoseFrame>();
  private readonly lastSeenAtByClientId = new Map<string, number>();
  private readonly videoIdByClientId = new Map<string, string>();
  private readonly comparator: PoseComparator;

  constructor(private readonly prisma: PrismaService) {
    this.comparator = new PoseComparator();
  }

  async startVideo(clientId: string): Promise<void> {
    try {
      const video = await this.prisma.video.create({
        data: {
          startTime: new Date(),
        },
      });
      this.videoIdByClientId.set(clientId, video.id);
      this.logger.log(
        `Started video recording for clientId=${clientId} videoId=${video.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to start video for clientId=${clientId}`,
        error,
      );
    }
  }

  async upsertLatest(clientId: string, frame: PoseFrame): Promise<void> {
    this.latestByClientId.set(clientId, frame);
    this.lastSeenAtByClientId.set(clientId, Date.now());

    const videoId = this.videoIdByClientId.get(clientId);
    if (videoId) {
      // Intentionally not awaiting to avoid blocking the websocket loop heavily,
      // but catching errors to prevent unhandled rejections.
      this.prisma.frame
        .create({
          data: {
            videoId,
            data: frame as unknown as Prisma.InputJsonValue,
          },
        })
        .catch((err) => {
          this.logger.error(`Failed to save frame for videoId=${videoId}`, err);
        });
    }
  }

  async removeClient(clientId: string): Promise<void> {
    this.latestByClientId.delete(clientId);
    this.lastSeenAtByClientId.delete(clientId);

    const videoId = this.videoIdByClientId.get(clientId);
    if (videoId) {
      this.videoIdByClientId.delete(clientId);
      try {
        await this.prisma.video.update({
          where: { id: videoId },
          data: { endTime: new Date() },
        });
        this.logger.log(
          `Ended video recording for clientId=${clientId} videoId=${videoId}`,
        );
      } catch (error) {
        this.logger.error(`Failed to end video for videoId=${videoId}`, error);
      }
    }
  }

  listClients(): Array<{ clientId: string; lastSeenAt: number | null }> {
    const clientIds = new Set<string>([
      ...this.latestByClientId.keys(),
      ...this.lastSeenAtByClientId.keys(),
    ]);

    return [...clientIds].map((clientId) => ({
      clientId,
      lastSeenAt: this.lastSeenAtByClientId.get(clientId) ?? null,
    }));
  }

  getLatest(clientId: string): PoseFrame | null {
    return this.latestByClientId.get(clientId) ?? null;
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
    try {
      const videos = await this.prisma.video.findMany({
        include: {
          _count: {
            select: { frames: true },
          },
        },
        orderBy: { startTime: 'desc' },
      });

      return videos.map((video) => {
        const duration =
          video.endTime
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
    } catch (error) {
      this.logger.error('Failed to list videos', error);
      return [];
    }
  }

  async getVideoById(videoId: string): Promise<Video | null> {
    try {
      const video = await this.prisma.video.findUnique({
        where: { id: videoId },
        include: {
          frames: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!video) {
        return null;
      }

      const frames: Frame[] = video.frames
        .map((frame) => {
          const data = frame.data as any;
          if (!data || !data.landmarks) {
            return null;
          }

          const landmarks: Landmark[] = data.landmarks.map((lm: any) => ({
            x: lm.x ?? 0,
            y: lm.y ?? 0,
            z: lm.z ?? 0,
            visibility: lm.visibility,
          }));

          return {
            landmarks,
            timestamp: data.timestamp ?? 0,
          };
        })
        .filter((frame): frame is Frame => frame !== null);

      return { frames };
    } catch (error) {
      this.logger.error(`Failed to get video videoId=${videoId}`, error);
      return null;
    }
  }

  async compareVideos(
    referenceVideoId: string,
    comparisonVideoId: string,
    config?: ComparatorConfig,
  ): Promise<ScoringResult | null> {
    try {
      const referenceVideo = await this.getVideoById(referenceVideoId);
      const comparisonVideo = await this.getVideoById(comparisonVideoId);

      if (!referenceVideo || !comparisonVideo) {
        this.logger.warn(
          `Failed to compare videos: reference=${!!referenceVideo}, comparison=${!!comparisonVideo}`,
        );
        return null;
      }

      const comparator = config ? new PoseComparator(config) : this.comparator;
      const result = comparator.compareVideos(referenceVideo, comparisonVideo);

      this.logger.log(
        `Compared videos: ref=${referenceVideoId}, comp=${comparisonVideoId}, score=${result.overallScore.toFixed(2)}`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to compare videos ref=${referenceVideoId} comp=${comparisonVideoId}`,
        error,
      );
      return null;
    }
  }
}
