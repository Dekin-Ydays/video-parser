import type { MediapipeLandmark, PoseFrame } from '../types/pose.types';
import { isRecord } from '../../utils';

function isLandmark(value: unknown): value is MediapipeLandmark {
  if (!isRecord(value)) return false;
  const candidate = value;
  return typeof candidate.x === 'number' && typeof candidate.y === 'number';
}

function pickLandmarkList(value: unknown): unknown[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;

  if (value.some(isLandmark)) return value;

  for (let i = value.length - 1; i >= 0; i -= 1) {
    const inner = pickLandmarkList(value[i]);
    if (inner && inner.some(isLandmark)) return inner;
  }

  return null;
}

export function normalizeFrame(payload: unknown): PoseFrame | null {
  const timestamp =
    isRecord(payload) && typeof payload.timestamp === 'number'
      ? payload.timestamp
      : Date.now();

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

  const landmarks = picked.filter(isLandmark);
  if (landmarks.length === 0) return null;

  return { timestamp, landmarks, rawType };
}
