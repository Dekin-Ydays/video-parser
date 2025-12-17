import { Logger } from '@nestjs/common';
import { WebSocketGateway } from '@nestjs/websockets';
import { randomUUID } from 'crypto';
import type { IncomingMessage } from 'http';
import type WebSocket from 'ws';
import type { RawData } from 'ws';
import { PoseService } from './pose.service';
import { normalizeFrame } from './pose.normalization';

type WelcomeMessage = {
  type: 'welcome';
  clientId: string;
  serverTime: number;
};

type AckMessage = {
  type: 'ack';
  clientId: string;
  receivedAt: number;
  landmarkCount: number;
};

type ErrorMessage = {
  type: 'error';
  message: string;
};

function rawDataToString(data: RawData): string | null {
  if (typeof data === 'string') return data;
  if (data instanceof Buffer) return data.toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return null;
}

@WebSocketGateway({ path: '/ws' })
export class PoseGateway {
  private readonly logger = new Logger(PoseGateway.name);
  private readonly clientIdBySocket = new WeakMap<WebSocket, string>();

  constructor(private readonly poseService: PoseService) {}

  handleConnection(client: WebSocket, request: IncomingMessage) {
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

    this.poseService.startVideo(clientId);

    client.on('message', (data) => this.onMessage(client, data));
  }

  handleDisconnect(client: WebSocket) {
    const clientId = this.clientIdBySocket.get(client);
    if (clientId) this.poseService.removeClient(clientId);
    this.logger.log(`WS disconnected clientId=${clientId ?? 'unknown'}`);
  }

  private onMessage(client: WebSocket, data: RawData): void {
    const clientId = this.clientIdBySocket.get(client) ?? 'unknown';

    const text = rawDataToString(data);
    if (!text)
      return this.sendError(
        client,
        'Unsupported message type (expected text/buffer)',
      );

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return this.sendError(client, 'Invalid JSON');
    }

    const frame = normalizeFrame(payload);
    if (!frame) {
      return this.sendError(
        client,
        'Invalid payload; expected an array of landmarks or an object with landmarks/poseLandmarks/points/data',
      );
    }

    this.poseService.upsertLatest(clientId, frame);
    this.logger.log(
      `Received frame from clientId=${clientId} with ${frame.landmarks.length} landmarks`,
    );

    const ack: AckMessage = {
      type: 'ack',
      clientId,
      receivedAt: Date.now(),
      landmarkCount: frame.landmarks.length,
    };
    client.send(JSON.stringify(ack));
  }

  private sendError(client: WebSocket, message: string): void {
    const error: ErrorMessage = { type: 'error', message };
    client.send(JSON.stringify(error));
  }
}
