import { Logger } from '@nestjs/common';
import { WebSocketGateway } from '@nestjs/websockets';
import { SkipThrottle } from '@nestjs/throttler';
import { randomUUID } from 'crypto';
import type { IncomingMessage } from 'http';
import type WebSocket from 'ws';
import type { RawData } from 'ws';
import { PoseFrameIngestionService } from '../pose-frame-ingestion.service';
import { PoseLiveRecordingService } from '../pose-live-recording.service';

type WelcomeMessage = {
  type: 'welcome';
  clientId: string;
  serverTime: number;
};

type ErrorMessage = {
  type: 'error';
  message: string;
};

@SkipThrottle()
@WebSocketGateway({ path: '/ws', maxPayload: 1024 * 64 })
export class PoseGateway {
  private readonly logger = new Logger(PoseGateway.name);
  private readonly clientIdBySocket = new WeakMap<WebSocket, string>();

  public constructor(
    private readonly frameIngestionService: PoseFrameIngestionService,
    private readonly liveRecordingService: PoseLiveRecordingService,
  ) {}

  public handleConnection(client: WebSocket, request: IncomingMessage) {
    const clientId = randomUUID();
    this.clientIdBySocket.set(client, clientId);

    const remote = request.socket.remoteAddress ?? 'unknown';
    this.logger.log(`WS connected clientId=${clientId} remote=${remote}`);

    const welcome: WelcomeMessage = {
      type: 'welcome',
      clientId,
      serverTime: Date.now(),
    };
    client.send(JSON.stringify(welcome));

    void this.liveRecordingService.connectClient(clientId).catch((error) => {
      this.logger.error(
        `Failed to start live recording for clientId=${clientId}`,
        error,
      );
    });

    client.on('message', (data) => this.onMessage(client, data));
  }

  public async handleDisconnect(client: WebSocket): Promise<void> {
    const clientId = this.clientIdBySocket.get(client);
    this.clientIdBySocket.delete(client);

    if (clientId) {
      await this.liveRecordingService.disconnectClient(clientId);
    }
    this.logger.log(`WS disconnected clientId=${clientId ?? 'unknown'}`);
  }

  private onMessage(client: WebSocket, data: RawData): void {
    const clientId = this.clientIdBySocket.get(client);
    if (!clientId) {
      return;
    }

    const ingested = this.frameIngestionService.ingest(data);
    if ('message' in ingested) {
      return this.sendError(client, ingested.message);
    }

    const accepted = this.liveRecordingService.appendFrame(
      clientId,
      ingested.frame,
    );
    if (!accepted) {
      return this.sendError(client, 'Client is not accepting pose frames');
    }
  }

  private sendError(client: WebSocket, message: string): void {
    const error: ErrorMessage = { type: 'error', message };
    client.send(JSON.stringify(error));
  }
}
