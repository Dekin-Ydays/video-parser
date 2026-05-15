import { Module } from '@nestjs/common';
import { PoseController } from './controllers/pose.controller';
import { PoseGateway } from './controllers/pose.gateway';
import { PoseService } from './pose.service';
import { PrismaService } from '../prisma.service';
import { PoseVideoRepository } from './pose-video.repository';
import { PoseRecordingSessionService } from './pose-recording-session.service';
import { FrameBufferService } from './frame.buffer';
import { MinioModule } from '../minio/minio.module';
import { PoseExtractionService } from './pose-extraction.service';
import { PoseVideoProcessingService } from './pose-video-processing.service';
import { PoseExtractionJobRepository } from './pose-extraction-job.repository';
import { PoseLiveRecordingService } from './pose-live-recording.service';

@Module({
  imports: [MinioModule],
  controllers: [PoseController],
  providers: [
    PoseGateway,
    PoseService,
    PoseRecordingSessionService,
    PoseVideoRepository,
    PrismaService,
    FrameBufferService,
    PoseExtractionService,
    PoseExtractionJobRepository,
    PoseLiveRecordingService,
    PoseVideoProcessingService,
  ],
})
export class PoseModule {}
