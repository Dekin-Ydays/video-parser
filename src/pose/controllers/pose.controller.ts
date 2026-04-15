import {
  BadRequestException,
  Body,
  Controller,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  CompareVideosFailureOutcome,
  isCompareVideosSuccess,
  PoseService,
  UploadedVideoFileInput,
} from '../pose.service';
import { CompareVideosDto } from '../dto/compare-videos.dto';

@Controller('pose')
export class PoseController {
  constructor(private readonly poseService: PoseService) {}

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
  async processVideo(@UploadedFile() file?: UploadedVideoFileInput) {
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
      return await this.poseService.extractAndStoreVideo(file);
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
