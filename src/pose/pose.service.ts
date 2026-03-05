import { Injectable, Logger } from '@nestjs/common';
import type { PoseFrame } from './types/pose.types';
import { PrismaService } from '../prisma.service';
import { Prisma } from '../generated/client/client';
import {
  adaptComparatorConfig,
  Frame,
  Landmark,
  PoseComparator,
  ScoringResult,
  Video,
} from './comparator';

@Injectable()
export class PoseService {
  private readonly logger = new Logger(PoseService.name);
  private readonly latestByClientId = new Map<string, PoseFrame>();
  private readonly lastSeenAtByClientId = new Map<string, number>();
  private readonly videoIdByClientId = new Map<string, string>();
  private readonly videoStartPromiseByClientId = new Map<
    string,
    Promise<string | null>
  >();
  private readonly pendingFramesByClientId = new Map<string, PoseFrame[]>();
  private readonly comparator: PoseComparator;

  constructor(private readonly prisma: PrismaService) {
    this.comparator = new PoseComparator();
  }

  async startVideo(clientId: string): Promise<void> {
    await this.ensureVideoStarted(clientId);
  }

  async upsertLatest(clientId: string, frame: PoseFrame): Promise<void> {
    this.latestByClientId.set(clientId, frame);
    this.lastSeenAtByClientId.set(clientId, Date.now());

    const videoId = this.videoIdByClientId.get(clientId);
    if (videoId) {
      this.persistFrame(videoId, frame);
      return;
    }

    const pending = this.pendingFramesByClientId.get(clientId) ?? [];
    pending.push(frame);
    this.pendingFramesByClientId.set(clientId, pending);

    void this.ensureVideoStarted(clientId)
      .then((createdVideoId) => {
        if (!createdVideoId) {
          this.pendingFramesByClientId.delete(clientId);
          return;
        }

        const queuedFrames = this.pendingFramesByClientId.get(clientId);
        if (!queuedFrames || queuedFrames.length === 0) {
          return;
        }

        this.pendingFramesByClientId.delete(clientId);
        for (const queuedFrame of queuedFrames) {
          this.persistFrame(createdVideoId, queuedFrame);
        }
      })
      .catch((error) => {
        this.logger.error(
          `Failed to flush buffered frames for clientId=${clientId}`,
          error,
        );
      });
  }

  async removeClient(clientId: string): Promise<void> {
    this.latestByClientId.delete(clientId);
    this.lastSeenAtByClientId.delete(clientId);
    this.pendingFramesByClientId.delete(clientId);

    const inFlightVideoStart = this.videoStartPromiseByClientId.get(clientId);
    if (inFlightVideoStart) {
      await inFlightVideoStart;
    }

    const videoId = this.videoIdByClientId.get(clientId);
    if (videoId) {
      this.videoIdByClientId.delete(clientId);
      try {
        const frameCount = await this.prisma.frame.count({
          where: { videoId },
        });

        if (frameCount === 0) {
          await this.prisma.video.delete({
            where: { id: videoId },
          });
          this.logger.log(
            `Deleted empty video for clientId=${clientId} videoId=${videoId}`,
          );
        } else {
          await this.prisma.video.update({
            where: { id: videoId },
            data: { endTime: new Date() },
          });
          this.logger.log(
            `Ended video recording for clientId=${clientId} videoId=${videoId}`,
          );
        }
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
          const data = frame.data as Record<string, unknown> | null;
          if (
            !data ||
            !Array.isArray(data.landmarks)
          ) {
            return null;
          }

          const landmarks: Landmark[] = (data.landmarks as Record<string, unknown>[]).map((lm) => ({
            x: typeof lm.x === 'number' ? lm.x : 0,
            y: typeof lm.y === 'number' ? lm.y : 0,
            z: typeof lm.z === 'number' ? lm.z : 0,
            visibility: typeof lm.visibility === 'number' ? lm.visibility : undefined,
          }));

          return {
            landmarks,
            timestamp: typeof data.timestamp === 'number' ? data.timestamp : 0,
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
    config?: unknown,
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

      const comparatorConfig = adaptComparatorConfig(config);
      const comparator = comparatorConfig
        ? new PoseComparator(comparatorConfig)
        : this.comparator;
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

  private persistFrame(videoId: string, frame: PoseFrame): void {
    // Intentionally not awaiting to avoid blocking the websocket loop heavily,
    // but catching errors to prevent unhandled rejections.
    this.prisma.frame
      .create({
        data: {
          videoId,
          data: frame as unknown as Prisma.InputJsonValue,
        },
      })
      .catch((error) => {
        this.logger.error(`Failed to save frame for videoId=${videoId}`, error);
      });
  }

  private ensureVideoStarted(clientId: string): Promise<string | null> {
    const existingVideoId = this.videoIdByClientId.get(clientId);
    if (existingVideoId) {
      return Promise.resolve(existingVideoId);
    }

    const existingPromise = this.videoStartPromiseByClientId.get(clientId);
    if (existingPromise) {
      return existingPromise;
    }

    const startPromise = this.prisma.video
      .create({
        data: {
          startTime: new Date(),
        },
      })
      .then((video) => {
        this.videoIdByClientId.set(clientId, video.id);
        this.logger.log(
          `Started video recording for clientId=${clientId} videoId=${video.id}`,
        );
        return video.id;
      })
      .catch((error) => {
        this.logger.error(`Failed to start video for clientId=${clientId}`, error);
        return null;
      })
      .finally(() => {
        this.videoStartPromiseByClientId.delete(clientId);
      });

    this.videoStartPromiseByClientId.set(clientId, startPromise);
    return startPromise;
  }
}
