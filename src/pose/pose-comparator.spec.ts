import { PoseComparator } from './pose-comparator';
import { Video, Frame, Landmark } from './pose-comparison.types';

describe('PoseComparator', () => {
  let comparator: PoseComparator;

  beforeEach(() => {
    comparator = new PoseComparator();
  });

  const createLandmark = (
    x: number,
    y: number,
    z: number,
    visibility = 1,
  ): Landmark => ({
    x,
    y,
    z,
    visibility,
  });

  const createStandardFrame = (offset = 0): Frame => {
    const landmarks: Landmark[] = [];

    // Create 33 landmarks (MediaPipe standard)
    for (let i = 0; i < 33; i++) {
      landmarks.push(
        createLandmark(i * 0.1 + offset, i * 0.1 + offset, i * 0.1 + offset),
      );
    }

    // Set specific landmarks for normalization
    landmarks[11] = createLandmark(-0.5 + offset, 0 + offset, 0 + offset); // left shoulder
    landmarks[12] = createLandmark(0.5 + offset, 0 + offset, 0 + offset); // right shoulder
    landmarks[23] = createLandmark(-0.25 + offset, -1 + offset, 0 + offset); // left hip
    landmarks[24] = createLandmark(0.25 + offset, -1 + offset, 0 + offset); // right hip

    return { landmarks, timestamp: 0 };
  };

  describe('compareVideos', () => {
    it('should return perfect score for identical videos', () => {
      const frame1 = createStandardFrame();
      const frame2 = createStandardFrame();
      const video1: Video = { frames: [frame1] };
      const video2: Video = { frames: [frame2] };

      const result = comparator.compareVideos(video1, video2);

      expect(result.overallScore).toBeGreaterThan(95);
      expect(result.frameScores).toHaveLength(1);
      expect(result.breakdown.positionScore).toBeGreaterThan(95);
      expect(result.breakdown.angularScore).toBeGreaterThan(0);
    });

    it('should handle videos with different positions due to normalization', () => {
      const frame1 = createStandardFrame(0);
      const frame2 = createStandardFrame(10);
      const video1: Video = { frames: [frame1] };
      const video2: Video = { frames: [frame2] };

      const result = comparator.compareVideos(video1, video2);

      expect(result.overallScore).toBeGreaterThan(95);
    });

    it('should return lower score for different poses', () => {
      const frame1 = createStandardFrame(0);
      const landmarks2: Landmark[] = [];

      for (let i = 0; i < 33; i++) {
        // Different values
        landmarks2.push(createLandmark(i * 0.2, i * 0.15, i * 0.05));
      }

      landmarks2[11] = createLandmark(-0.5, 0, 0);
      landmarks2[12] = createLandmark(0.5, 0, 0);
      landmarks2[23] = createLandmark(-0.25, -1, 0);
      landmarks2[24] = createLandmark(0.25, -1, 0);

      const frame2: Frame = { landmarks: landmarks2, timestamp: 0 };

      const video1: Video = { frames: [frame1] };
      const video2: Video = { frames: [frame2] };

      const result = comparator.compareVideos(video1, video2);

      expect(result.overallScore).toBeLessThan(95);
    });

    it('should handle empty videos', () => {
      const video1: Video = { frames: [] };
      const video2: Video = { frames: [] };

      const result = comparator.compareVideos(video1, video2);

      expect(result.overallScore).toBe(0);
      expect(result.frameScores).toHaveLength(0);
    });

    it('should handle videos of different lengths', () => {
      const frame = createStandardFrame();
      const video1: Video = { frames: [frame, frame, frame] };
      const video2: Video = { frames: [frame] };

      const result = comparator.compareVideos(video1, video2);

      expect(result.frameScores).toHaveLength(1);
      expect(result.breakdown.timingScore).toBeCloseTo(33.33, 1);
    });

    it('should handle videos with same length', () => {
      const frame = createStandardFrame();
      const video1: Video = { frames: [frame, frame] };
      const video2: Video = { frames: [frame, frame] };

      const result = comparator.compareVideos(video1, video2);

      expect(result.breakdown.timingScore).toBe(100);
    });

    it('should provide statistics in breakdown', () => {
      const frame1 = createStandardFrame();
      const frame2 = createStandardFrame();
      const video1: Video = { frames: [frame1, frame2] };
      const video2: Video = { frames: [frame1, frame2] };

      const result = comparator.compareVideos(video1, video2);

      expect(result.breakdown.statistics).toBeDefined();
      expect(result.breakdown.statistics.mean).toBeDefined();
      expect(result.breakdown.statistics.min).toBeDefined();
      expect(result.breakdown.statistics.max).toBeDefined();
      expect(result.breakdown.statistics.variance).toBeDefined();
    });

    it('should skip invisible landmarks', () => {
      const frame1 = createStandardFrame();
      const frame2 = createStandardFrame();

      // Make some landmarks invisible
      frame2.landmarks[5] = createLandmark(100, 100, 100, 0.2);
      frame2.landmarks[10] = createLandmark(100, 100, 100, 0.3);

      const video1: Video = { frames: [frame1] };
      const video2: Video = { frames: [frame2] };

      const result = comparator.compareVideos(video1, video2);

      // Should still get high score because invisible landmarks are skipped
      expect(result.overallScore).toBeGreaterThan(90);
    });

    it('should handle frames with insufficient landmarks for angles', () => {
      const landmarks: Landmark[] = [];
      for (let i = 0; i < 20; i++) {
        landmarks.push(createLandmark(i * 0.1, i * 0.1, i * 0.1));
      }

      const frame: Frame = { landmarks, timestamp: 0 };
      const video1: Video = { frames: [frame] };
      const video2: Video = { frames: [frame] };

      const result = comparator.compareVideos(video1, video2);

      expect(result.breakdown.angularScore).toBe(0);
    });
  });

  describe('constructor configuration', () => {
    it('should use default configuration when none provided', () => {
      const comp = new PoseComparator();
      const frame = createStandardFrame();
      const video: Video = { frames: [frame] };

      const result = comp.compareVideos(video, video);

      expect(result).toBeDefined();
    });

    it('should accept custom normalization options', () => {
      const comp = new PoseComparator({
        normalization: {
          center: true,
          scale: true,
          rotation: true,
        },
      });

      const frame = createStandardFrame();
      const video: Video = { frames: [frame] };

      const result = comp.compareVideos(video, video);

      expect(result.overallScore).toBeGreaterThan(95);
    });

    it('should accept custom weights', () => {
      const comp = new PoseComparator({
        positionWeight: 0.8,
        angularWeight: 0.2,
      });

      const frame = createStandardFrame();
      const video: Video = { frames: [frame] };

      const result = comp.compareVideos(video, video);

      expect(result).toBeDefined();
    });

    it('should accept custom visibility threshold', () => {
      const comp = new PoseComparator({
        visibilityThreshold: 0.8,
      });

      const frame1 = createStandardFrame();
      const frame2 = createStandardFrame();

      // Make landmark barely visible at 0.6
      frame2.landmarks[5] = createLandmark(100, 100, 100, 0.6);

      const video1: Video = { frames: [frame1] };
      const video2: Video = { frames: [frame2] };

      const result = comp.compareVideos(video1, video2);

      // With threshold 0.8, landmark at 0.6 should be skipped
      expect(result).toBeDefined();
    });
  });

  describe('pose variation scenarios', () => {
    it('should give high score for same pose with different screen position', () => {
      const frame1 = createStandardFrame(0);
      const frame2 = createStandardFrame(5);

      const video1: Video = { frames: [frame1] };
      const video2: Video = { frames: [frame2] };

      const result = comparator.compareVideos(video1, video2);

      expect(result.overallScore).toBeGreaterThan(95);
    });

    it('should give lower score for significantly different joint angles', () => {
      const frame1 = createStandardFrame();
      const frame2 = createStandardFrame();

      // Change elbow position significantly to alter joint angle
      frame2.landmarks[13] = createLandmark(10, 10, 10);
      frame2.landmarks[14] = createLandmark(10, 10, 10);

      const video1: Video = { frames: [frame1] };
      const video2: Video = { frames: [frame2] };

      const result = comparator.compareVideos(video1, video2);

      expect(result.overallScore).toBeLessThan(90);
    });
  });

  describe('edge cases', () => {
    it('should handle frames with all invisible landmarks', () => {
      const landmarks: Landmark[] = [];
      for (let i = 0; i < 33; i++) {
        landmarks.push(createLandmark(i * 0.1, i * 0.1, i * 0.1, 0.1));
      }

      const frame: Frame = { landmarks, timestamp: 0 };
      const video1: Video = { frames: [frame] };
      const video2: Video = { frames: [frame] };

      const result = comparator.compareVideos(video1, video2);

      expect(result.breakdown.positionScore).toBe(0);
    });

    it('should handle videos with multiple frames', () => {
      const frames = [
        createStandardFrame(0),
        createStandardFrame(0),
        createStandardFrame(0),
      ];

      const video1: Video = { frames };
      const video2: Video = { frames };

      const result = comparator.compareVideos(video1, video2);

      expect(result.frameScores).toHaveLength(3);
      expect(result.breakdown.statistics.mean).toBeGreaterThan(95);
    });
  });
});
