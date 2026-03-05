import { Reader } from 'protobufjs/minimal';
import type { MediapipeLandmark } from '../types/pose.types';

type LongLike = {
  toNumber?: () => number;
};

export type ProtobufPoseFramePayload = {
  timestamp?: number;
  type?: string;
  landmarks: Array<Partial<MediapipeLandmark>>;
};

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (value && typeof value === 'object') {
    const longLike = value as LongLike;
    if (typeof longLike.toNumber === 'function') {
      const numberValue = longLike.toNumber();
      if (Number.isFinite(numberValue)) {
        return numberValue;
      }
    }
  }

  return undefined;
}

function readNumericField(
  reader: Reader,
  wireType: number,
): number | undefined {
  if (wireType === 0) {
    return toFiniteNumber(reader.int64() as unknown);
  }
  if (wireType === 1) {
    return reader.double();
  }
  if (wireType === 5) {
    return reader.float();
  }

  reader.skipType(wireType);
  return undefined;
}

function decodeLandmark(
  reader: Reader,
  length: number,
): Partial<MediapipeLandmark> {
  const end = reader.pos + length;
  const landmark: Partial<MediapipeLandmark> = {};

  while (reader.pos < end) {
    const tag = reader.uint32();
    const fieldNumber = tag >>> 3;
    const wireType = tag & 7;
    const value = readNumericField(reader, wireType);

    if (fieldNumber === 1 && typeof value === 'number') {
      landmark.x = value;
      continue;
    }
    if (fieldNumber === 2 && typeof value === 'number') {
      landmark.y = value;
      continue;
    }
    if (fieldNumber === 3 && typeof value === 'number') {
      landmark.z = value;
      continue;
    }
    if (fieldNumber === 4 && typeof value === 'number') {
      landmark.visibility = value;
      continue;
    }
    if (fieldNumber === 5 && typeof value === 'number') {
      landmark.presence = value;
      continue;
    }
  }

  return landmark;
}

export function decodePoseFrameProtobufBinary(
  data: Uint8Array,
): ProtobufPoseFramePayload | null {
  try {
    const reader = Reader.create(data);
    const frame: ProtobufPoseFramePayload = {
      landmarks: [],
    };

    while (reader.pos < reader.len) {
      const tag = reader.uint32();
      const fieldNumber = tag >>> 3;
      const wireType = tag & 7;

      if (fieldNumber === 1) {
        const timestamp = readNumericField(reader, wireType);
        if (typeof timestamp === 'number') frame.timestamp = timestamp;
        continue;
      }

      if (fieldNumber === 2) {
        if (wireType === 2) {
          frame.type = reader.string();
        } else {
          reader.skipType(wireType);
        }
        continue;
      }

      if (fieldNumber === 3) {
        if (wireType === 2) {
          frame.landmarks.push(decodeLandmark(reader, reader.uint32()));
        } else {
          reader.skipType(wireType);
        }
        continue;
      }

      reader.skipType(wireType);
    }

    return frame.landmarks.length > 0 ? frame : null;
  } catch {
    return null;
  }
}
