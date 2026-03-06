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

export type CompareVideosErrorCode =
  | 'not_found'
  | 'invalid_config'
  | 'internal_error';

export type CompareVideosSuccessOutcome = { ok: true; result: ScoringResult };
export type CompareVideosFailureOutcome = {
  ok: false;
  error: CompareVideosErrorCode;
  message: string;
};

export type CompareVideosOutcome =
  | CompareVideosSuccessOutcome
  | CompareVideosFailureOutcome;

export function isCompareVideosSuccess(
  outcome: CompareVideosOutcome,
): outcome is CompareVideosSuccessOutcome {
  return outcome.ok === true;
}

@Injectable()
export class PoseService {
  private readonly logger = new Logger(PoseService.name);
  private readonly comparator = new PoseComparator();
  private readonly comparisonAlgorithmVersion = 'pose-comparator:v1';

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

  async upsertLatestBatch(clientId: string, frames: PoseFrame[]): Promise<void> {
    await this.sessionService.upsertLatestBatch(clientId, frames);
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
  ): Promise<CompareVideosOutcome> {
    try {
      const referenceVideo = await this.getVideoById(referenceVideoId);
      const comparisonVideo = await this.getVideoById(comparisonVideoId);

      if (!referenceVideo || !comparisonVideo) {
        this.logger.warn(
          `Failed to compare videos: reference=${!!referenceVideo}, comparison=${!!comparisonVideo}`,
        );
        return {
          ok: false,
          error: 'not_found',
          message: 'One or both videos were not found',
        };
      }

      if (this.isInvalidCompareConfig(config)) {
        return {
          ok: false,
          error: 'invalid_config',
          message: 'Invalid comparator configuration',
        };
      }

      const comparatorConfig = adaptComparatorConfig(config);
      const comparator = comparatorConfig
        ? new PoseComparator(comparatorConfig)
        : this.comparator;
      const result = comparator.compareVideos(referenceVideo, comparisonVideo);
      await this.persistComparisonResult(
        referenceVideoId,
        comparisonVideoId,
        result,
      );

      this.logger.log(
        `Compared videos: ref=${referenceVideoId}, comp=${comparisonVideoId}, score=${result.overallScore.toFixed(2)}`,
      );

      return { ok: true, result };
    } catch (error) {
      this.logger.error(
        `Failed to compare videos ref=${referenceVideoId} comp=${comparisonVideoId}`,
        error,
      );
      return {
        ok: false,
        error: 'internal_error',
        message: 'Failed to compare videos due to an internal error',
      };
    }
  }

  private isInvalidCompareConfig(config: unknown): boolean {
    if (config === undefined) {
      return false;
    }

    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return true;
    }

    const rawObject = config as Record<string, unknown>;
    if (Object.keys(rawObject).length === 0) {
      return false;
    }

    return adaptComparatorConfig(config) === undefined;
  }

  private async persistComparisonResult(
    referenceVideoId: string,
    comparisonVideoId: string,
    result: ScoringResult,
  ): Promise<void> {
    try {
      await this.videoRepository.createComparisonResult({
        referenceVideoId,
        comparisonVideoId,
        result,
        algorithmVersion: this.comparisonAlgorithmVersion,
      });
    } catch (error) {
      this.logger.warn(
        `Comparison succeeded but result persistence failed for ref=${referenceVideoId} comp=${comparisonVideoId}: ${this.stringifyError(error)}`,
      );
    }
  }

  private mapStoredVideoToVideo(storedVideo: StoredPoseVideoRecord): Video {
    const frames: Frame[] = storedVideo.frames
      .map((frame, index) => this.mapStoredFrameToFrame(frame.data, index))
      .filter((frame): frame is Frame => frame !== null);

    return { frames };
  }

  private mapStoredFrameToFrame(
    rawData: unknown,
    frameIndex: number,
  ): Frame | null {
    const data =
      rawData && typeof rawData === 'object'
        ? (rawData as Record<string, unknown>)
        : null;
    if (!data) {
      this.logger.warn(`Skipping frame ${frameIndex}: non-object data payload`);
      return null;
    }

    if (
      typeof data.timestamp !== 'number' ||
      !Number.isFinite(data.timestamp)
    ) {
      this.logger.warn(`Skipping frame ${frameIndex}: invalid timestamp`);
      return null;
    }

    if (!Array.isArray(data.landmarks)) {
      this.logger.warn(
        `Skipping frame ${frameIndex}: landmarks is not an array`,
      );
      return null;
    }

    let invalidLandmarkCount = 0;
    const landmarks: Landmark[] = [];

    for (const rawLandmark of data.landmarks) {
      const landmark = this.mapStoredLandmark(rawLandmark);
      if (!landmark) {
        invalidLandmarkCount += 1;
        continue;
      }
      landmarks.push(landmark);
    }

    if (invalidLandmarkCount > 0) {
      this.logger.warn(
        `Frame ${frameIndex}: skipped ${invalidLandmarkCount} invalid landmarks`,
      );
    }

    if (landmarks.length === 0) {
      this.logger.warn(`Skipping frame ${frameIndex}: no valid landmarks`);
      return null;
    }

    return {
      landmarks,
      timestamp: data.timestamp,
    };
  }

  private mapStoredLandmark(rawLandmark: unknown): Landmark | null {
    if (!rawLandmark || typeof rawLandmark !== 'object') {
      return null;
    }

    const landmark = rawLandmark as Record<string, unknown>;
    if (
      typeof landmark.x !== 'number' ||
      !Number.isFinite(landmark.x) ||
      typeof landmark.y !== 'number' ||
      !Number.isFinite(landmark.y) ||
      typeof landmark.z !== 'number' ||
      !Number.isFinite(landmark.z)
    ) {
      return null;
    }

    return {
      x: landmark.x,
      y: landmark.y,
      z: landmark.z,
      visibility:
        typeof landmark.visibility === 'number' &&
        Number.isFinite(landmark.visibility)
          ? landmark.visibility
          : undefined,
    };
  }

  private stringifyError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
