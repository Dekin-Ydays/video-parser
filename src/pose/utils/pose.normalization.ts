import type { MediapipeLandmark, PoseFrame } from '../types/pose.types';

function isLandmark(value: unknown): value is MediapipeLandmark {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
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
    payload &&
    typeof payload === 'object' &&
    typeof (payload as any).timestamp === 'number'
      ? (payload as any).timestamp
      : Date.now();

  const rawType =
    payload &&
    typeof payload === 'object' &&
    typeof (payload as any).type === 'string'
      ? (payload as any).type
      : undefined;

  const landmarksCandidate = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object'
      ? ((payload as any).landmarks ??
        (payload as any).poseLandmarks ??
        (payload as any).points ??
        (payload as any).data)
      : null;

  const picked = pickLandmarkList(landmarksCandidate);
  if (!picked) return null;

  const landmarks = picked.filter(isLandmark);
  if (landmarks.length === 0) return null;

  return { timestamp, landmarks, rawType };
}
