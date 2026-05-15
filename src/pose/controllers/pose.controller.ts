import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  InternalServerErrorException,
  MessageEvent,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  Sse,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Readable } from 'node:stream';
import { FileInterceptor } from '@nestjs/platform-express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  CompareVideosFailureOutcome,
  isCompareVideosSuccess,
  PoseService,
  UploadedVideoFileInput,
} from '../pose.service';
import { PoseVideoProcessingService } from '../pose-video-processing.service';
import { CompareVideosDto } from '../dto/compare-videos.dto';
import {
  PoseExtractionService,
  ExtractionProgressEvent,
} from '../pose-extraction.service';
import { MinioService } from '../../minio/minio.service';

@Controller('pose')
export class PoseController {
  constructor(
    private readonly poseService: PoseService,
    private readonly poseVideoProcessingService: PoseVideoProcessingService,
    private readonly poseExtractionService: PoseExtractionService,
    private readonly minioService: MinioService,
  ) {}

  @Get('health')
  health() {
    const extraction = this.poseExtractionService.getHealth();
    const storage = this.minioService.getStatus();
    return {
      ...extraction,
      ready: extraction.ready && storage.ready,
      storage,
    };
  }

  @Sse('extraction/events')
  extractionEvents(): Observable<MessageEvent> {
    return this.poseExtractionService.progress$.pipe(
      map((event: ExtractionProgressEvent) => ({
        data: event,
        type: 'extraction-progress',
      })),
    );
  }

  @Get('clients')
  listClients() {
    return this.poseService.listClients();
  }

  @Get('videos')
  listVideos() {
    return this.poseService.listVideos();
  }

  @Get('latest/:clientId')
  getLatest(@Param('clientId') clientId: string) {
    const latest = this.poseService.getLatest(clientId);
    if (!latest) throw new NotFoundException('No pose data for client');
    return latest;
  }

  @Get('video/:videoId')
  async getVideo(@Param('videoId') videoId: string) {
    const video = await this.poseService.getVideoById(videoId);
    if (!video) throw new NotFoundException('Video not found');
    return video;
  }

  @Get('video/:videoId/source')
  @Header('Accept-Ranges', 'none')
  async getSourceVideo(
    @Param('videoId') videoId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const stream = await this.poseService.streamSourceVideo(videoId);
    if (!stream) {
      throw new NotFoundException('Source video not found');
    }
    res.setHeader('Content-Type', stream.contentType);
    if (stream.contentLength !== undefined) {
      res.setHeader('Content-Length', String(stream.contentLength));
    }
    return new StreamableFile(stream.body as Readable);
  }

  @Post('video')
  @UseInterceptors(FileInterceptor('file'))
  async uploadVideo(@UploadedFile() file?: UploadedVideoFileInput) {
    if (!file) {
      throw new BadRequestException('Video file is required');
    }

    if (!file.mimetype?.startsWith('video/')) {
      throw new BadRequestException('Only video files are supported');
    }

    if (!file.buffer || file.size <= 0) {
      throw new BadRequestException('Uploaded video file is empty');
    }

    return this.poseService.uploadVideoFile(file);
  }

  @Post('video/process')
  @UseInterceptors(FileInterceptor('file'))
  async processVideo(
    @UploadedFile() file?: UploadedVideoFileInput,
    @Query('jobId') jobId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Video file is required');
    }
    if (!file.mimetype?.startsWith('video/')) {
      throw new BadRequestException('Only video files are supported');
    }
    if (!file.buffer || file.size <= 0) {
      throw new BadRequestException('Uploaded video file is empty');
    }

    try {
      return await this.poseVideoProcessingService.processUploadedVideo(
        file,
        jobId,
      );
    } catch (error) {
      throw new InternalServerErrorException(
        `Pose extraction failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  @Post('compare')
  async compareVideos(@Body() body: CompareVideosDto) {
    const comparison = await this.poseService.compareVideos(
      body.referenceVideoId,
      body.comparisonVideoId,
      body.config,
    );

    if (isCompareVideosSuccess(comparison)) {
      return comparison.result;
    }

    const { error, message } = comparison as CompareVideosFailureOutcome;

    if (error === 'invalid_config') {
      throw new BadRequestException(message);
    }

    if (error === 'not_found') {
      throw new NotFoundException(message);
    }

    throw new InternalServerErrorException(message);
  }
}
