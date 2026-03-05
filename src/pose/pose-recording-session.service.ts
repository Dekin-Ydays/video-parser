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
  private readonly pendingFramesByClientId = new Map<string, PoseFrame[]>();
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
    if (
      this.clientStateByClientId.getOrCreateOpen(clientId, () => null) ===
      undefined
    ) {
      return;
    }

    this.latestByClientId.set(clientId, frame);
    this.lastSeenAtByClientId.set(clientId, Date.now());

    const videoId = this.videoIdByClientId.get(clientId);
    if (videoId) {
      this.enqueueFramePersist(clientId, videoId, frame);
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

        const queuedFrames = this.drainPendingFrames(clientId);
        for (const queuedFrame of queuedFrames) {
          this.enqueueFramePersist(clientId, createdVideoId, queuedFrame);
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
      for (const queuedFrame of queuedFrames) {
        this.enqueueFramePersist(clientId, videoId, queuedFrame);
      }

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
    this.frameWriteChainByClientId.delete(clientId);
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

  private enqueueFramePersist(
    clientId: string,
    videoId: string,
    frame: PoseFrame,
  ): void {
    const currentChain =
      this.frameWriteChainByClientId.get(clientId) ?? Promise.resolve();

    // Chain frame writes per client to keep ordering and support deterministic
    // flush before ending the video session.
    const nextChain = currentChain
      .catch(() => undefined)
      .then(async () => {
        try {
          await this.videoRepository.createFrame(videoId, frame);
        } catch (error) {
          this.logger.error(
            `Failed to save frame for videoId=${videoId}`,
            error,
          );
        }
      });

    this.frameWriteChainByClientId.set(clientId, nextChain);
  }

  private async flushFrameWrites(clientId: string): Promise<void> {
    while (true) {
      const currentChain = this.frameWriteChainByClientId.get(clientId);
      if (!currentChain) {
        return;
      }

      await currentChain;
      if (this.frameWriteChainByClientId.get(clientId) === currentChain) {
        this.frameWriteChainByClientId.delete(clientId);
        return;
      }
    }
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
