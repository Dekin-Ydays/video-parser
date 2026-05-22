import { Injectable } from '@nestjs/common';
import type { RawData } from 'ws';
import { tryParseJson } from '../utils';
import type { PoseFrame } from './types/pose.types';
import { parsePoseFrame } from './utils/pose-frame.parser';
import { decodePoseFrameProtobufBinary } from './utils/pose.protobuf';

export type PoseFrameIngestionResult =
  | { ok: true; frame: PoseFrame }
  | { ok: false; message: string };

const INVALID_FRAME_MESSAGE =
  'Invalid payload; expected protobuf PoseFrame landmarks (or JSON landmarks/poseLandmarks/points/data)';

function rawDataToBuffer(data: RawData): Buffer | null {
  if (data instanceof Buffer) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  return null;
}

@Injectable()
export class PoseFrameIngestionService {
  ingest(data: RawData | string): PoseFrameIngestionResult {
    const decoded = this.decodeIncomingPayload(data);
    if ('message' in decoded) {
      return decoded;
    }

    const frame = parsePoseFrame(decoded.payload, {
      defaultTimestamp: () => Date.now(),
    });

    if (!frame) {
      return { ok: false, message: INVALID_FRAME_MESSAGE };
    }

    return { ok: true, frame };
  }

  private decodeIncomingPayload(
    data: RawData | string,
  ): { ok: true; payload: unknown } | { ok: false; message: string } {
    if (typeof data === 'string') {
      const jsonPayload = tryParseJson(data);
      if (jsonPayload === null) return { ok: false, message: 'Invalid JSON' };
      return { ok: true, payload: jsonPayload };
    }

    const binary = rawDataToBuffer(data);
    if (!binary) {
      return {
        ok: false,
        message: 'Unsupported message type (expected protobuf binary)',
      };
    }

    const protobufPayload = decodePoseFrameProtobufBinary(binary);
    if (protobufPayload) {
      return { ok: true, payload: protobufPayload };
    }

    const fallbackJson = tryParseJson(binary.toString('utf8'));
    if (fallbackJson !== null) {
      return { ok: true, payload: fallbackJson };
    }

    return { ok: false, message: 'Invalid protobuf payload' };
  }
}
