import type { PoseFrame } from '../types/pose.types';
import { parsePoseFrame } from './pose-frame.parser';

export function normalizeFrame(payload: unknown): PoseFrame | null {
  return parsePoseFrame(payload, { defaultTimestamp: () => Date.now() });
}
