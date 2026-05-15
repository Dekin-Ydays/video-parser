import type { Frame, Landmark } from '../types/pose-comparison.types';
import type { MediapipeLandmark, PoseFrame } from '../types/pose.types';
import { isRecord } from '../../utils';

export interface ParsePoseFrameOptions {
  defaultTimestamp?: () => number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function pickLandmarkList(value: unknown): unknown[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;

  if (value.some((candidate) => parseLandmark(candidate) !== null)) {
    return value;
  }

  for (let i = value.length - 1; i >= 0; i -= 1) {
    const inner = pickLandmarkList(value[i]);
    if (inner && inner.some((candidate) => parseLandmark(candidate) !== null)) {
      return inner;
    }
  }

  return null;
}

export function parseLandmark(value: unknown): Landmark | null {
  if (!isRecord(value)) return null;

  if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y)) {
    return null;
  }

  const z = isFiniteNumber(value.z) ? value.z : 0;
  const landmark: Landmark = {
    x: value.x,
    y: value.y,
    z,
  };

  if (isFiniteNumber(value.visibility)) {
    landmark.visibility = value.visibility;
  }

  return landmark;
}

export function parsePoseFrame(
  payload: unknown,
  options: ParsePoseFrameOptions = {},
): PoseFrame | null {
  const timestamp =
    isRecord(payload) && isFiniteNumber(payload.timestamp)
      ? payload.timestamp
      : options.defaultTimestamp?.();

  if (!isFiniteNumber(timestamp)) {
    return null;
  }

  const rawType =
    isRecord(payload) && typeof payload.type === 'string'
      ? payload.type
      : undefined;

  const landmarksCandidate = Array.isArray(payload)
    ? payload
    : isRecord(payload)
      ? (payload.landmarks ??
        payload.poseLandmarks ??
        payload.points ??
        payload.data)
      : null;

  const picked = pickLandmarkList(landmarksCandidate);
  if (!picked) return null;

  const landmarks: MediapipeLandmark[] = picked
    .map(parseLandmark)
    .filter((landmark): landmark is Landmark => landmark !== null);

  if (landmarks.length === 0) return null;

  return { timestamp, landmarks, rawType };
}

export function parseScoringFrame(payload: unknown): Frame | null {
  const frame = parsePoseFrame(payload);
  if (!frame) return null;

  return {
    timestamp: frame.timestamp,
    landmarks: frame.landmarks.map((landmark) => ({
      x: landmark.x,
      y: landmark.y,
      z: landmark.z ?? 0,
      visibility: landmark.visibility,
    })),
  };
}
