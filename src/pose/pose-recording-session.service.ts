import { Injectable, Logger } from '@nestjs/common';
import type { PoseFrame } from './types/pose.types';
import { PoseVideoRepository } from './pose-video.repository';
import { ClientStateMap } from './client-state.map';

@Injectable()
export class PoseRecordingSessionService {
  private readonly logger = new Logger(PoseRecordingSessionService.name);
  private readonly clientStateByClientId = new ClientStateMap<null>();
  private readonly latestByClientId = new Map<string, PoseFrame>();
  private readonly lastSeenAtByClientId = new Map<string, number>();
  private readonly videoIdByClientId = new Map<string, string>();
  private readonly videoStartPromiseByClientId = new Map<
    string,
    Promise<string | null>
  >();
  private readonly startFlushScheduledByClientId = new Set<string>();
  private readonly pendingFramesByClientId = new Map<string, PoseFrame[]>();
  private readonly pendingWriteFramesByClientId = new Map<string, PoseFrame[]>();
  private readonly frameWriteChainByClientId = new Map<string, Promise<void>>();

  constructor(private readonly videoRepository: PoseVideoRepository) {}

  async startVideo(clientId: string): Promise<void> {
    if (
      this.clientStateByClientId.getOrCreateOpen(clientId, () => null) ===
      undefined
    ) {
      return;
    }

    await this.ensureVideoStarted(clientId);
  }

  async upsertLatest(clientId: string, frame: PoseFrame): Promise<void> {
    await this.upsertLatestBatch(clientId, [frame]);
  }

  async upsertLatestBatch(clientId: string, frames: PoseFrame[]): Promise<void> {
    if (frames.length === 0) {
      return;
    }

    if (
      this.clientStateByClientId.getOrCreateOpen(clientId, () => null) ===
      undefined
    ) {
      return;
    }

    const latestFrame = frames[frames.length - 1];
    this.latestByClientId.set(clientId, latestFrame);
    this.lastSeenAtByClientId.set(clientId, Date.now());

    const videoId = this.videoIdByClientId.get(clientId);
    if (videoId) {
      this.enqueueFramePersist(clientId, videoId, frames);
      return;
    }

    const pending = this.pendingFramesByClientId.get(clientId) ?? [];
    pending.push(...frames);
    this.pendingFramesByClientId.set(clientId, pending);

    this.schedulePendingFlush(clientId);
  }

  async removeClient(clientId: string): Promise<void> {
    this.clientStateByClientId.markClosing(clientId);

    this.latestByClientId.delete(clientId);
    this.lastSeenAtByClientId.delete(clientId);

    const inFlightVideoStart = this.videoStartPromiseByClientId.get(clientId);
    if (inFlightVideoStart) {
      await inFlightVideoStart;
    }

    const videoId = this.videoIdByClientId.get(clientId);
    if (videoId) {
      const queuedFrames = this.drainPendingFrames(clientId);
      this.enqueueFramePersist(clientId, videoId, queuedFrames);

      await this.flushFrameWrites(clientId);
      this.videoIdByClientId.delete(clientId);

      try {
        const frameCount = await this.videoRepository.countFrames(videoId);

        if (frameCount === 0) {
          await this.videoRepository.deleteVideo(videoId);
          this.logger.log(
            `Deleted empty video for clientId=${clientId} videoId=${videoId}`,
          );
        } else {
          await this.videoRepository.endVideo(videoId, new Date());
          this.logger.log(
            `Ended video recording for clientId=${clientId} videoId=${videoId}`,
          );
        }
      } catch (error) {
        this.logger.error(`Failed to end video for videoId=${videoId}`, error);
      }
    }

    this.pendingFramesByClientId.delete(clientId);
    this.pendingWriteFramesByClientId.delete(clientId);
    this.frameWriteChainByClientId.delete(clientId);
    this.startFlushScheduledByClientId.delete(clientId);
    this.clientStateByClientId.delete(clientId);
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

  private drainPendingFrames(clientId: string): PoseFrame[] {
    const queuedFrames = this.pendingFramesByClientId.get(clientId) ?? [];
    this.pendingFramesByClientId.delete(clientId);
    return queuedFrames;
  }

  private schedulePendingFlush(clientId: string): void {
    if (this.startFlushScheduledByClientId.has(clientId)) {
      return;
    }

    this.startFlushScheduledByClientId.add(clientId);
    void this.flushPendingAfterStart(clientId);
  }

  private async flushPendingAfterStart(clientId: string): Promise<void> {
    try {
      const createdVideoId = await this.ensureVideoStarted(clientId);
      if (!createdVideoId) {
        this.pendingFramesByClientId.delete(clientId);
        return;
      }

      const queuedFrames = this.drainPendingFrames(clientId);
      this.enqueueFramePersist(clientId, createdVideoId, queuedFrames);
    } catch (error) {
      this.logger.error(
        `Failed to flush buffered frames for clientId=${clientId}`,
        error,
      );
    } finally {
      this.startFlushScheduledByClientId.delete(clientId);
    }
  }

  private enqueueFramePersist(
    clientId: string,
    videoId: string,
    frames: PoseFrame | PoseFrame[],
  ): void {
    const queuedFrames = this.pendingWriteFramesByClientId.get(clientId) ?? [];
    if (Array.isArray(frames)) {
      queuedFrames.push(...frames);
    } else {
      queuedFrames.push(frames);
    }
    this.pendingWriteFramesByClientId.set(clientId, queuedFrames);

    if (this.frameWriteChainByClientId.has(clientId)) {
      return;
    }

    // Persist sequentially per client, but write all queued frames in each pass.
    const nextChain = this.persistQueuedFrames(clientId, videoId).catch(
      () => undefined,
    );
    this.frameWriteChainByClientId.set(clientId, nextChain);
  }

  private async flushFrameWrites(clientId: string): Promise<void> {
    const currentChain = this.frameWriteChainByClientId.get(clientId);
    if (!currentChain) {
      return;
    }

    await currentChain;
  }

  private async persistQueuedFrames(
    clientId: string,
    videoId: string,
  ): Promise<void> {
    while (true) {
      const queuedFrames = this.drainPendingWriteFrames(clientId);
      if (queuedFrames.length === 0) {
        this.frameWriteChainByClientId.delete(clientId);
        return;
      }

      try {
        await this.videoRepository.createFrames(videoId, queuedFrames);
      } catch (error) {
        this.logger.error(
          `Failed to save frames for videoId=${videoId}`,
          error,
        );
      }
    }
  }

  private drainPendingWriteFrames(clientId: string): PoseFrame[] {
    const queuedFrames = this.pendingWriteFramesByClientId.get(clientId) ?? [];
    this.pendingWriteFramesByClientId.delete(clientId);
    return queuedFrames;
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

    const startPromise = this.videoRepository
      .createVideo(new Date())
      .then((videoId) => {
        this.videoIdByClientId.set(clientId, videoId);
        this.logger.log(
          `Started video recording for clientId=${clientId} videoId=${videoId}`,
        );
        return videoId;
      })
      .catch((error) => {
        this.logger.error(
          `Failed to start video for clientId=${clientId}`,
          error,
        );
        return null;
      })
      .finally(() => {
        this.videoStartPromiseByClientId.delete(clientId);
      });

    this.videoStartPromiseByClientId.set(clientId, startPromise);
    return startPromise;
  }
}
