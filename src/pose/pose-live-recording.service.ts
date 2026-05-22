import { Injectable } from '@nestjs/common';
import { FrameBufferService } from './frame.buffer';
import type { PoseFrame } from './types/pose.types';
import { PoseRecordingSessionService } from './pose-recording-session.service';

@Injectable()
export class PoseLiveRecordingService {
  constructor(
    private readonly sessionService: PoseRecordingSessionService,
    private readonly frameBufferService: FrameBufferService,
  ) {}

  async connectClient(clientId: string): Promise<void> {
    await this.sessionService.startVideo(clientId);
  }

  appendFrame(clientId: string, frame: PoseFrame): boolean {
    return this.frameBufferService.appendFrame(clientId, frame);
  }

  async disconnectClient(clientId: string): Promise<void> {
    await this.frameBufferService.disconnectClient(clientId);
    await this.sessionService.removeClient(clientId);
  }
}
