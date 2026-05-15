import { Injectable } from '@nestjs/common';
import { FrameBufferService } from './frame.buffer';
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

  appendPayload(clientId: string, payload: unknown): boolean {
    return this.frameBufferService.appendPayload(clientId, payload);
  }

  async disconnectClient(clientId: string): Promise<void> {
    await this.frameBufferService.disconnectClient(clientId);
    await this.sessionService.removeClient(clientId);
  }
}
