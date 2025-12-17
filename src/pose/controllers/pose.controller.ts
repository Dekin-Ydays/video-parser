import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Body,
} from '@nestjs/common';
import { PoseService } from '../pose.service';
import { ComparatorConfig } from '../comparator';

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

  @Post('compare')
  async compareVideos(
    @Body()
    body: {
      referenceVideoId: string;
      comparisonVideoId: string;
      config?: ComparatorConfig;
    },
  ) {
    const result = await this.poseService.compareVideos(
      body.referenceVideoId,
      body.comparisonVideoId,
      body.config,
    );

    if (!result) {
      throw new NotFoundException('One or both videos not found');
    }

    return result;
  }
}
