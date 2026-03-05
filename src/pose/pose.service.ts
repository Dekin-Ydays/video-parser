import { Injectable, Logger } from '@nestjs/common';
import type { PoseFrame } from './types/pose.types';
import {
  adaptComparatorConfig,
  Frame,
  Landmark,
  PoseComparator,
  ScoringResult,
  Video,
} from './comparator';
import {
  PoseVideoRepository,
  StoredPoseVideoRecord,
} from './pose-video.repository';
import { PoseRecordingSessionService } from './pose-recording-session.service';

@Injectable()
export class PoseService {
  private readonly logger = new Logger(PoseService.name);
  private readonly comparator = new PoseComparator();

  constructor(
    private readonly sessionService: PoseRecordingSessionService,
    private readonly videoRepository: PoseVideoRepository,
  ) {}

  async startVideo(clientId: string): Promise<void> {
    await this.sessionService.startVideo(clientId);
  }

  async upsertLatest(clientId: string, frame: PoseFrame): Promise<void> {
    await this.sessionService.upsertLatest(clientId, frame);
  }

  async removeClient(clientId: string): Promise<void> {
    await this.sessionService.removeClient(clientId);
  }

  listClients(): Array<{ clientId: string; lastSeenAt: number | null }> {
    return this.sessionService.listClients();
  }

  getLatest(clientId: string): PoseFrame | null {
    return this.sessionService.getLatest(clientId);
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
      return await this.videoRepository.listVideos();
    } catch (error) {
      this.logger.error('Failed to list videos', error);
      return [];
    }
  }

  async getVideoById(videoId: string): Promise<Video | null> {
    try {
      const storedVideo = await this.videoRepository.getVideoById(videoId);
      if (!storedVideo) {
        return null;
      }
      return this.mapStoredVideoToVideo(storedVideo);
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

  private mapStoredVideoToVideo(storedVideo: StoredPoseVideoRecord): Video {
    const frames: Frame[] = storedVideo.frames
      .map((frame) => {
        const data = frame.data as Record<string, unknown> | null;
        if (!data || !Array.isArray(data.landmarks)) {
          return null;
        }

        const landmarks: Landmark[] = (
          data.landmarks as Record<string, unknown>[]
        ).map((lm) => ({
          x: typeof lm.x === 'number' ? lm.x : 0,
          y: typeof lm.y === 'number' ? lm.y : 0,
          z: typeof lm.z === 'number' ? lm.z : 0,
          visibility:
            typeof lm.visibility === 'number' ? lm.visibility : undefined,
        }));

        return {
          landmarks,
          timestamp: typeof data.timestamp === 'number' ? data.timestamp : 0,
        };
      })
      .filter((frame): frame is Frame => frame !== null);

    return { frames };
  }
}
