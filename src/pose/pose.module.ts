import { Module } from '@nestjs/common';
import { PoseController } from './controllers/pose.controller';
import { PoseGateway } from './controllers/pose.gateway';
import { PoseService } from './pose.service';
import { PrismaService } from '../prisma.service';
import { PoseVideoRepository } from './pose-video.repository';
import { PoseRecordingSessionService } from './pose-recording-session.service';
import { FrameBufferService } from './frame.buffer';

@Module({
  controllers: [PoseController],
  providers: [
    PoseGateway,
    PoseService,
    PoseRecordingSessionService,
    PoseVideoRepository,
    PrismaService,
    FrameBufferService,
  ],
})
export class PoseModule {}
