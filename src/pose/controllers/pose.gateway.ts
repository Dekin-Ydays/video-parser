import { Logger } from '@nestjs/common';
import { WebSocketGateway } from '@nestjs/websockets';
import { SkipThrottle } from '@nestjs/throttler';
import { randomUUID } from 'crypto';
import type { IncomingMessage } from 'http';
import type WebSocket from 'ws';
import type { RawData } from 'ws';
import { tryParseJson } from '../../utils';
import { PoseService } from '../pose.service';
import { FrameBufferService } from '../frame.buffer';
import { decodePoseFrameProtobufBinary } from '../utils/pose.protobuf';

type WelcomeMessage = {
  type: 'welcome';
  clientId: string;
  serverTime: number;
};

type ErrorMessage = {
  type: 'error';
  message: string;
};

type IncomingPayloadResult = { payload: unknown } | { error: string };

function rawDataToBuffer(data: RawData): Buffer | null {
  if (data instanceof Buffer) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  return null;
}

function decodeIncomingPayload(data: RawData): IncomingPayloadResult {
  if (typeof data === 'string') {
    const jsonPayload = tryParseJson(data);
    if (jsonPayload === null) return { error: 'Invalid JSON' };
    return { payload: jsonPayload };
  }

  const binary = rawDataToBuffer(data);
  if (!binary) {
    return { error: 'Unsupported message type (expected protobuf binary)' };
  }

  const protobufPayload = decodePoseFrameProtobufBinary(binary);
  if (protobufPayload) {
    return { payload: protobufPayload };
  }

  const fallbackJson = tryParseJson(binary.toString('utf8'));
  if (fallbackJson !== null) {
    return { payload: fallbackJson };
  }

  return { error: 'Invalid protobuf payload' };
}

@SkipThrottle()
@WebSocketGateway({ path: '/ws', maxPayload: 1024 * 64 })
export class PoseGateway {
  private readonly logger = new Logger(PoseGateway.name);
  private readonly clientIdBySocket = new WeakMap<WebSocket, string>();

  public constructor(
    private readonly poseService: PoseService,
    private readonly frameBufferService: FrameBufferService,
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

    this.poseService.startVideo(clientId);

    client.on('message', (data) => this.onMessage(client, data));
  }

  public async handleDisconnect(client: WebSocket): Promise<void> {
    const clientId = this.clientIdBySocket.get(client);
    this.clientIdBySocket.delete(client);

    if (clientId) {
      await this.frameBufferService.disconnectClient(clientId);
      await this.poseService.removeClient(clientId);
    }
    this.logger.log(`WS disconnected clientId=${clientId ?? 'unknown'}`);
  }

  private onMessage(client: WebSocket, data: RawData): void {
    const clientId = this.clientIdBySocket.get(client);
    if (!clientId) {
      return;
    }

    const decoded = decodeIncomingPayload(data);
    if ('error' in decoded) {
      return this.sendError(client, decoded.error);
    }

    const accepted = this.frameBufferService.appendPayload(
      clientId,
      decoded.payload,
    );
    if (!accepted) {
      return this.sendError(
        client,
        'Invalid payload; expected protobuf PoseFrame landmarks (or JSON landmarks/poseLandmarks/points/data)',
      );
    }
  }

  private sendError(client: WebSocket, message: string): void {
    const error: ErrorMessage = { type: 'error', message };
    client.send(JSON.stringify(error));
  }
}
