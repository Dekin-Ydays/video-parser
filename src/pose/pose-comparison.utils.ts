import { Landmark, Frame } from './pose-comparison.types';

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Calculate the midpoint between two 3D points
 */
export function calculateMidpoint(p1: Point3D, p2: Point3D): Point3D {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
    z: (p1.z + p2.z) / 2,
  };
}

/**
 * Calculate Euclidean distance between two 3D points
 */
export function calculateDistance(p1: Point3D, p2: Point3D): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = p1.z - p2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Translate all landmarks by a given offset
 */
export function translateLandmarks(
  landmarks: Landmark[],
  offset: Point3D,
): Landmark[] {
  return landmarks.map((landmark) => ({
    ...landmark,
    x: landmark.x - offset.x,
    y: landmark.y - offset.y,
    z: landmark.z - offset.z,
  }));
}

/**
 * Scale all landmarks by a given factor
 */
export function scaleLandmarks(
  landmarks: Landmark[],
  factor: number,
): Landmark[] {
  if (factor === 0) return landmarks;
  return landmarks.map((landmark) => ({
    ...landmark,
    x: landmark.x / factor,
    y: landmark.y / factor,
    z: landmark.z / factor,
  }));
}

/**
 * Rotate landmarks around the Y-axis by a given angle (in radians)
 * Used for rotation normalization in the XZ plane
 */
export function rotateLandmarksY(
  landmarks: Landmark[],
  angleRadians: number,
): Landmark[] {
  const cos = Math.cos(angleRadians);
  const sin = Math.sin(angleRadians);

  return landmarks.map((landmark) => ({
    ...landmark,
    x: landmark.x * cos - landmark.z * sin,
    z: landmark.x * sin + landmark.z * cos,
  }));
}

/**
 * Calculate the angle between three 3D points (joint angle)
 * Returns angle in degrees
 */
export function calculateJointAngle(
  point1: Point3D,
  point2: Point3D,
  point3: Point3D,
): number {
  // Vector from point2 to point1
  const v1 = {
    x: point1.x - point2.x,
    y: point1.y - point2.y,
    z: point1.z - point2.z,
  };

  // Vector from point2 to point3
  const v2 = {
    x: point3.x - point2.x,
    y: point3.y - point2.y,
    z: point3.z - point2.z,
  };

  // Dot product
  const dotProduct = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;

  // Magnitudes
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);

  // Avoid division by zero
  if (mag1 === 0 || mag2 === 0) return 0;

  // Calculate angle in radians
  const cosAngle = dotProduct / (mag1 * mag2);
  // Clamp to [-1, 1] to handle floating point errors
  const clampedCosAngle = Math.max(-1, Math.min(1, cosAngle));
  const angleRadians = Math.acos(clampedCosAngle);

  // Convert to degrees
  return (angleRadians * 180) / Math.PI;
}

/**
 * Calculate statistics for an array of numbers
 */
export function calculateStatistics(values: number[]): {
  mean: number;
  min: number;
  max: number;
  variance: number;
} {
  if (values.length === 0) {
    return { mean: 0, min: 0, max: 0, variance: 0 };
  }

  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);

  const variance =
    values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
    values.length;

  return { mean, min, max, variance };
}

/**
 * Normalize a frame by centering landmarks around the hip midpoint
 */
export function centerNormalize(frame: Frame): Frame {
  const { landmarks } = frame;

  // MediaPipe landmark indices: 23 = left hip, 24 = right hip
  if (landmarks.length < 25) {
    return frame;
  }

  const leftHip = landmarks[23];
  const rightHip = landmarks[24];

  // Calculate hip center
  const hipCenter = calculateMidpoint(leftHip, rightHip);

  // Translate all landmarks
  const normalizedLandmarks = translateLandmarks(landmarks, hipCenter);

  return {
    ...frame,
    landmarks: normalizedLandmarks,
  };
}

/**
 * Normalize a frame by scaling based on shoulder width
 */
export function scaleNormalize(frame: Frame): Frame {
  const { landmarks } = frame;

  // MediaPipe landmark indices: 11 = left shoulder, 12 = right shoulder
  if (landmarks.length < 13) {
    return frame;
  }

  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];

  // Calculate shoulder width
  const shoulderWidth = calculateDistance(leftShoulder, rightShoulder);

  if (shoulderWidth === 0) {
    return frame;
  }

  // Scale all landmarks so shoulder width = 1.0
  const normalizedLandmarks = scaleLandmarks(landmarks, shoulderWidth);

  return {
    ...frame,
    landmarks: normalizedLandmarks,
  };
}

/**
 * Normalize a frame by rotating to align shoulder line horizontally
 */
export function rotationNormalize(frame: Frame): Frame {
  const { landmarks } = frame;

  // MediaPipe landmark indices: 11 = left shoulder, 12 = right shoulder
  if (landmarks.length < 13) {
    return frame;
  }

  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];

  // Calculate rotation angle in XZ plane
  const dx = rightShoulder.x - leftShoulder.x;
  const dz = rightShoulder.z - leftShoulder.z;
  const angle = Math.atan2(dz, dx);

  // Rotate all landmarks to align shoulders horizontally
  const normalizedLandmarks = rotateLandmarksY(landmarks, -angle);

  return {
    ...frame,
    landmarks: normalizedLandmarks,
  };
}

/**
 * Check if a landmark is visible based on visibility threshold
 */
export function isLandmarkVisible(
  landmark: Landmark,
  threshold: number,
): boolean {
  return landmark.visibility === undefined || landmark.visibility >= threshold;
}
