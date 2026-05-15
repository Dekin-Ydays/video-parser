import { Injectable, Logger } from '@nestjs/common';
import { MinioService, UploadedSourceVideo } from '../minio/minio.service';
import { PoseExtractionService } from './pose-extraction.service';
import { PoseVideoRepository } from './pose-video.repository';
import type { UploadedVideoFileInput } from './pose.service';

export interface ProcessedUploadedVideo {
  videoId: string;
  frameCount: number;
  fps: number;
  width: number;
  height: number;
  sourceVideo: UploadedSourceVideo;
}

@Injectable()
export class PoseVideoProcessingService {
  private readonly logger = new Logger(PoseVideoProcessingService.name);

  constructor(
    private readonly videoRepository: PoseVideoRepository,
    private readonly minioService: MinioService,
    private readonly extractionService: PoseExtractionService,
  ) {}

  async processUploadedVideo(
    file: UploadedVideoFileInput,
    jobId?: string,
  ): Promise<ProcessedUploadedVideo> {
    this.logger.log(
      `Processing uploaded video: name=${file.originalname} size=${file.size}`,
    );

    const sourceVideo = await this.minioService.uploadSourceVideo({
      body: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    });

    const extracted = await this.extractionService.extract(
      file.buffer,
      file.originalname,
      jobId,
    );

    const videoId = await this.videoRepository.createVideo();
    await this.videoRepository.createFrames(videoId, extracted.frames);
    await this.videoRepository.completeVideoFromStoredFrames(
      videoId,
      extracted.frames.length,
    );
    await this.videoRepository.setSourceObject(videoId, {
      bucket: this.minioService.getStatus().bucket,
      objectKey: sourceVideo.objectKey,
      mimeType: file.mimetype,
    });

    this.logger.log(
      `Video extracted: id=${videoId} frames=${extracted.frames.length} fps=${extracted.fps}`,
    );

    return {
      videoId,
      frameCount: extracted.frames.length,
      fps: extracted.fps,
      width: extracted.width,
      height: extracted.height,
      sourceVideo,
    };
  }
}
