import { Injectable, Logger } from '@nestjs/common';
import type { PoseFrame } from './types/pose.types';
import {
  adaptComparatorConfig,
  PoseComparator,
  ScoringResult,
  Video,
} from './comparator';
import { MinioService, UploadedSourceVideo } from '../minio/minio.service';
import { PoseVideoRepository } from './pose-video.repository';
import { PoseRecordingSessionService } from './pose-recording-session.service';
import { stringifyError } from '../utils';

export interface UploadedVideoFileInput {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

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
    private readonly minioService: MinioService,
  ) {}

  async streamSourceVideo(videoId: string): Promise<{
    body: NodeJS.ReadableStream;
    contentType: string;
    contentLength?: number;
  } | null> {
    const source = await this.videoRepository.getSourceObject(videoId);
    if (!source) return null;
    return this.minioService.streamSourceVideo(source.objectKey);
  }

  async startVideo(clientId: string): Promise<void> {
    await this.sessionService.startVideo(clientId);
  }

  async upsertLatest(clientId: string, frame: PoseFrame): Promise<void> {
    await this.sessionService.upsertLatest(clientId, frame);
  }

  async upsertLatestBatch(
    clientId: string,
    frames: PoseFrame[],
  ): Promise<void> {
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

  async uploadVideoFile(
    file: UploadedVideoFileInput,
  ): Promise<UploadedSourceVideo> {
    try {
      return await this.minioService.uploadSourceVideo({
        body: file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
      });
    } catch (error) {
      this.logger.error(
        `Failed to upload source video file=${file.originalname}`,
        error,
      );
      throw error;
    }
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
      return await this.videoRepository.getVideoById(videoId);
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
        `Comparison succeeded but result persistence failed for ref=${referenceVideoId} comp=${comparisonVideoId}: ${stringifyError(error)}`,
      );
    }
  }
}
