import { Frame, Landmark } from '../../types/pose-comparison.types';
import {
  calculateMidpoint,
  calculateDistance,
  translateLandmarks,
  scaleLandmarks,
  rotateLandmarksY,
  calculateJointAngle,
  calculateStatistics,
  centerNormalize,
  scaleNormalize,
  rotationNormalize,
  isLandmarkVisible,
} from './pose-comparison.utils';

describe('pose-comparison.utils', () => {
  describe('calculateMidpoint', () => {
    it('should calculate midpoint between two points', () => {
      const p1 = { x: 0, y: 0, z: 0 };
      const p2 = { x: 2, y: 4, z: 6 };
      const midpoint = calculateMidpoint(p1, p2);

      expect(midpoint).toEqual({ x: 1, y: 2, z: 3 });
    });

    it('should handle negative coordinates', () => {
      const p1 = { x: -2, y: -4, z: -6 };
      const p2 = { x: 2, y: 4, z: 6 };
      const midpoint = calculateMidpoint(p1, p2);

      expect(midpoint).toEqual({ x: 0, y: 0, z: 0 });
    });
  });

  describe('calculateDistance', () => {
    it('should calculate distance between two points', () => {
      const p1 = { x: 0, y: 0, z: 0 };
      const p2 = { x: 3, y: 4, z: 0 };
      const distance = calculateDistance(p1, p2);

      expect(distance).toBe(5);
    });

    it('should calculate 3D distance', () => {
      const p1 = { x: 0, y: 0, z: 0 };
      const p2 = { x: 1, y: 1, z: 1 };
      const distance = calculateDistance(p1, p2);

      expect(distance).toBeCloseTo(Math.sqrt(3), 5);
    });

    it('should return 0 for same point', () => {
      const p1 = { x: 1, y: 2, z: 3 };
      const p2 = { x: 1, y: 2, z: 3 };
      const distance = calculateDistance(p1, p2);

      expect(distance).toBe(0);
    });
  });

  describe('translateLandmarks', () => {
    it('should translate all landmarks by offset', () => {
      const landmarks: Landmark[] = [
        { x: 1, y: 2, z: 3, visibility: 1 },
        { x: 4, y: 5, z: 6, visibility: 1 },
      ];
      const offset = { x: 1, y: 1, z: 1 };
      const translated = translateLandmarks(landmarks, offset);

      expect(translated).toEqual([
        { x: 0, y: 1, z: 2, visibility: 1 },
        { x: 3, y: 4, z: 5, visibility: 1 },
      ]);
    });
  });

  describe('scaleLandmarks', () => {
    it('should scale all landmarks by factor', () => {
      const landmarks: Landmark[] = [
        { x: 2, y: 4, z: 6, visibility: 1 },
        { x: 8, y: 10, z: 12, visibility: 1 },
      ];
      const scaled = scaleLandmarks(landmarks, 2);

      expect(scaled).toEqual([
        { x: 1, y: 2, z: 3, visibility: 1 },
        { x: 4, y: 5, z: 6, visibility: 1 },
      ]);
    });

    it('should handle zero factor gracefully', () => {
      const landmarks: Landmark[] = [{ x: 2, y: 4, z: 6, visibility: 1 }];
      const scaled = scaleLandmarks(landmarks, 0);

      expect(scaled).toEqual(landmarks);
    });
  });

  describe('rotateLandmarksY', () => {
    it('should rotate landmarks around Y axis by 90 degrees', () => {
      const landmarks: Landmark[] = [{ x: 1, y: 0, z: 0, visibility: 1 }];
      const rotated = rotateLandmarksY(landmarks, Math.PI / 2);

      expect(rotated[0].x).toBeCloseTo(0, 5);
      expect(rotated[0].y).toBe(0);
      expect(rotated[0].z).toBeCloseTo(1, 5);
    });

    it('should not change landmarks when rotating by 0', () => {
      const landmarks: Landmark[] = [{ x: 1, y: 2, z: 3, visibility: 1 }];
      const rotated = rotateLandmarksY(landmarks, 0);

      expect(rotated[0]).toEqual(landmarks[0]);
    });
  });

  describe('calculateJointAngle', () => {
    it('should calculate 90 degree angle', () => {
      const p1 = { x: 1, y: 0, z: 0 };
      const p2 = { x: 0, y: 0, z: 0 };
      const p3 = { x: 0, y: 1, z: 0 };
      const angle = calculateJointAngle(p1, p2, p3);

      expect(angle).toBeCloseTo(90, 1);
    });

    it('should calculate 180 degree angle', () => {
      const p1 = { x: -1, y: 0, z: 0 };
      const p2 = { x: 0, y: 0, z: 0 };
      const p3 = { x: 1, y: 0, z: 0 };
      const angle = calculateJointAngle(p1, p2, p3);

      expect(angle).toBeCloseTo(180, 1);
    });

    it('should calculate 0 degree angle for collinear points in same direction', () => {
      const p1 = { x: 1, y: 0, z: 0 };
      const p2 = { x: 0, y: 0, z: 0 };
      const p3 = { x: 2, y: 0, z: 0 };
      const angle = calculateJointAngle(p1, p2, p3);

      expect(angle).toBeCloseTo(0, 1);
    });

    it('should handle zero magnitude vectors', () => {
      const p1 = { x: 0, y: 0, z: 0 };
      const p2 = { x: 0, y: 0, z: 0 };
      const p3 = { x: 1, y: 0, z: 0 };
      const angle = calculateJointAngle(p1, p2, p3);

      expect(angle).toBe(0);
    });
  });

  describe('calculateStatistics', () => {
    it('should calculate statistics for array of values', () => {
      const values = [10, 20, 30, 40, 50];
      const stats = calculateStatistics(values);

      expect(stats.mean).toBe(30);
      expect(stats.min).toBe(10);
      expect(stats.max).toBe(50);
      expect(stats.variance).toBe(200);
    });

    it('should handle empty array', () => {
      const stats = calculateStatistics([]);

      expect(stats).toEqual({ mean: 0, min: 0, max: 0, variance: 0 });
    });

    it('should handle single value', () => {
      const stats = calculateStatistics([42]);

      expect(stats).toEqual({ mean: 42, min: 42, max: 42, variance: 0 });
    });
  });

  describe('centerNormalize', () => {
    it('should center landmarks around hip midpoint', () => {
      const landmarks: Landmark[] = Array(25).fill({
        x: 0,
        y: 0,
        z: 0,
        visibility: 1,
      });
      landmarks[23] = { x: -1, y: 0, z: 0, visibility: 1 }; // left hip
      landmarks[24] = { x: 1, y: 0, z: 0, visibility: 1 }; // right hip

      const frame: Frame = { landmarks, timestamp: 0 };
      const normalized = centerNormalize(frame);

      // Hip center should now be at (0, 0, 0)
      const hipCenter = calculateMidpoint(
        normalized.landmarks[23],
        normalized.landmarks[24],
      );
      expect(hipCenter.x).toBeCloseTo(0, 5);
      expect(hipCenter.y).toBeCloseTo(0, 5);
      expect(hipCenter.z).toBeCloseTo(0, 5);
    });

    it('should return frame unchanged if not enough landmarks', () => {
      const landmarks: Landmark[] = Array(10).fill({
        x: 1,
        y: 1,
        z: 1,
        visibility: 1,
      });
      const frame: Frame = { landmarks, timestamp: 0 };
      const normalized = centerNormalize(frame);

      expect(normalized).toEqual(frame);
    });
  });

  describe('scaleNormalize', () => {
    it('should scale landmarks to shoulder width of 1.0', () => {
      const landmarks: Landmark[] = Array(13).fill({
        x: 0,
        y: 0,
        z: 0,
        visibility: 1,
      });
      landmarks[11] = { x: -2, y: 0, z: 0, visibility: 1 }; // left shoulder
      landmarks[12] = { x: 2, y: 0, z: 0, visibility: 1 }; // right shoulder

      const frame: Frame = { landmarks, timestamp: 0 };
      const normalized = scaleNormalize(frame);

      const shoulderWidth = calculateDistance(
        normalized.landmarks[11],
        normalized.landmarks[12],
      );
      expect(shoulderWidth).toBeCloseTo(1.0, 5);
    });

    it('should return frame unchanged if not enough landmarks', () => {
      const landmarks: Landmark[] = Array(10).fill({
        x: 1,
        y: 1,
        z: 1,
        visibility: 1,
      });
      const frame: Frame = { landmarks, timestamp: 0 };
      const normalized = scaleNormalize(frame);

      expect(normalized).toEqual(frame);
    });

    it('should return frame unchanged if shoulder width is 0', () => {
      const landmarks: Landmark[] = Array(13).fill({
        x: 0,
        y: 0,
        z: 0,
        visibility: 1,
      });
      landmarks[11] = { x: 0, y: 0, z: 0, visibility: 1 };
      landmarks[12] = { x: 0, y: 0, z: 0, visibility: 1 };

      const frame: Frame = { landmarks, timestamp: 0 };
      const normalized = scaleNormalize(frame);

      expect(normalized).toEqual(frame);
    });
  });

  describe('rotationNormalize', () => {
    it('should align shoulders horizontally', () => {
      const landmarks: Landmark[] = Array(13).fill({
        x: 0,
        y: 0,
        z: 0,
        visibility: 1,
      });
      landmarks[11] = { x: 0, y: 0, z: 1, visibility: 1 }; // left shoulder
      landmarks[12] = { x: 1, y: 0, z: 0, visibility: 1 }; // right shoulder

      const frame: Frame = { landmarks, timestamp: 0 };
      const normalized = rotationNormalize(frame);

      // After rotation, shoulders should have approximately same z coordinate
      const leftShoulder = normalized.landmarks[11];
      const rightShoulder = normalized.landmarks[12];

      expect(Math.abs(leftShoulder.z - rightShoulder.z)).toBeLessThan(0.01);
    });

    it('should return frame unchanged if not enough landmarks', () => {
      const landmarks: Landmark[] = Array(10).fill({
        x: 1,
        y: 1,
        z: 1,
        visibility: 1,
      });
      const frame: Frame = { landmarks, timestamp: 0 };
      const normalized = rotationNormalize(frame);

      expect(normalized).toEqual(frame);
    });
  });

  describe('isLandmarkVisible', () => {
    it('should return true for visible landmark', () => {
      const landmark: Landmark = { x: 0, y: 0, z: 0, visibility: 0.8 };
      const visible = isLandmarkVisible(landmark, 0.5);

      expect(visible).toBe(true);
    });

    it('should return false for invisible landmark', () => {
      const landmark: Landmark = { x: 0, y: 0, z: 0, visibility: 0.3 };
      const visible = isLandmarkVisible(landmark, 0.5);

      expect(visible).toBe(false);
    });

    it('should return true for landmark without visibility property', () => {
      const landmark: Landmark = { x: 0, y: 0, z: 0 };
      const visible = isLandmarkVisible(landmark, 0.5);

      expect(visible).toBe(true);
    });

    it('should handle threshold edge case', () => {
      const landmark: Landmark = { x: 0, y: 0, z: 0, visibility: 0.5 };
      const visible = isLandmarkVisible(landmark, 0.5);

      expect(visible).toBe(true);
    });
  });
});
