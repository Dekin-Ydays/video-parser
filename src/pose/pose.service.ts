import { Injectable, Logger } from '@nestjs/common';
import type { PoseFrame } from './pose.types';
import { PrismaService } from '../prisma.service';
import { Prisma } from '../generated/client/client';

@Injectable()
export class PoseService {
  private readonly logger = new Logger(PoseService.name);
  private readonly latestByClientId = new Map<string, PoseFrame>();
  private readonly lastSeenAtByClientId = new Map<string, number>();
  private readonly videoIdByClientId = new Map<string, string>();

  constructor(private readonly prisma: PrismaService) {}

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
}
