import {
  Frame,
  Video,
  ScoringResult,
  ComparatorConfig,
  DEFAULT_COMPARATOR_CONFIG,
} from '../types/pose-comparison.types';
import {
  calculateDistance,
  calculateJointAngle,
  calculateStatistics,
  centerNormalize,
  scaleNormalize,
  rotationNormalize,
  isLandmarkVisible,
} from './utils/pose-comparison.utils';

export class PoseComparator {
  private readonly config: Required<
    Omit<ComparatorConfig, 'landmarkWeights'>
  > & { landmarkWeights: Map<number, number> };

  constructor(config?: ComparatorConfig) {
    this.config = {
      normalization: {
        ...DEFAULT_COMPARATOR_CONFIG.normalization,
        ...config?.normalization,
      },
      landmarkWeights:
        config?.landmarkWeights ?? DEFAULT_COMPARATOR_CONFIG.landmarkWeights,
      positionWeight:
        config?.positionWeight ?? DEFAULT_COMPARATOR_CONFIG.positionWeight,
      angularWeight:
        config?.angularWeight ?? DEFAULT_COMPARATOR_CONFIG.angularWeight,
      visibilityThreshold:
        config?.visibilityThreshold ??
        DEFAULT_COMPARATOR_CONFIG.visibilityThreshold,
    };
  }

  /**
   * Compare two videos and return a comprehensive scoring result
   */
  compareVideos(reference: Video, comparison: Video): ScoringResult {
    const alignedPairs = this.alignFramesByTimestamp(reference, comparison);
    const sampleCount = alignedPairs.length;

    if (sampleCount === 0) {
      return {
        overallScore: 0,
        frameScores: [],
        breakdown: {
          positionScore: 0,
          angularScore: 0,
          timingScore: 0,
          statistics: {
            mean: 0,
            min: 0,
            max: 0,
            variance: 0,
          },
        },
      };
    }

    // Calculate frame-by-frame scores
    const frameScores: number[] = [];
    let totalPositionScore = 0;
    let totalAngularScore = 0;

    for (const pair of alignedPairs) {
      const refFrame = this.normalizeFrame(pair.reference);
      const compFrame = this.normalizeFrame(pair.comparison);

      const frameScore = this.compareFrames(refFrame, compFrame);
      frameScores.push(frameScore);

      // Calculate component scores for breakdown
      const posScore = this.calculateEuclideanScore(refFrame, compFrame);
      const angScore = this.calculateAngularScore(refFrame, compFrame);

      totalPositionScore += posScore;
      totalAngularScore += angScore;
    }

    // Calculate timing score
    const timingScore = this.calculateTimingScore(reference, comparison);

    // Calculate statistics
    const statistics = calculateStatistics(frameScores);

    // Calculate breakdown scores
    const avgPositionScore = totalPositionScore / sampleCount;
    const avgAngularScore = totalAngularScore / sampleCount;

    return {
      overallScore: statistics.mean,
      frameScores,
      breakdown: {
        positionScore: avgPositionScore,
        angularScore: avgAngularScore,
        timingScore,
        statistics,
      },
    };
  }

  private alignFramesByTimestamp(
    reference: Video,
    comparison: Video,
  ): Array<{ reference: Frame; comparison: Frame }> {
    const referenceFrames = this.sortedFrames(reference);
    const comparisonFrames = this.sortedFrames(comparison);
    const sampleCount = Math.min(
      referenceFrames.length,
      comparisonFrames.length,
    );

    if (sampleCount === 0) {
      return [];
    }

    const referenceRange = this.timestampRange(referenceFrames);
    const comparisonRange = this.timestampRange(comparisonFrames);
    const pairs: Array<{ reference: Frame; comparison: Frame }> = [];

    for (let index = 0; index < sampleCount; index += 1) {
      const progress = sampleCount === 1 ? 0 : index / (sampleCount - 1);
      pairs.push({
        reference: this.sampleFrameAtProgress(
          referenceFrames,
          referenceRange,
          progress,
        ),
        comparison: this.sampleFrameAtProgress(
          comparisonFrames,
          comparisonRange,
          progress,
        ),
      });
    }

    return pairs;
  }

  private sortedFrames(video: Video): Frame[] {
    return [...video.frames].sort((a, b) => a.timestamp - b.timestamp);
  }

  private timestampRange(frames: Frame[]): { start: number; end: number } {
    return {
      start: frames[0].timestamp,
      end: frames[frames.length - 1].timestamp,
    };
  }

  private sampleFrameAtProgress(
    frames: Frame[],
    range: { start: number; end: number },
    progress: number,
  ): Frame {
    if (frames.length === 1 || range.start === range.end) {
      return frames[0];
    }

    const targetTimestamp = range.start + (range.end - range.start) * progress;
    return this.interpolateFrameAtTimestamp(frames, targetTimestamp);
  }

  private interpolateFrameAtTimestamp(
    frames: Frame[],
    targetTimestamp: number,
  ): Frame {
    if (targetTimestamp <= frames[0].timestamp) {
      return frames[0];
    }

    const lastFrame = frames[frames.length - 1];
    if (targetTimestamp >= lastFrame.timestamp) {
      return lastFrame;
    }

    for (let index = 1; index < frames.length; index += 1) {
      const after = frames[index];
      if (after.timestamp < targetTimestamp) {
        continue;
      }

      const before = frames[index - 1];
      const span = after.timestamp - before.timestamp;
      const ratio =
        span === 0 ? 0 : (targetTimestamp - before.timestamp) / span;
      return this.interpolateFrames(before, after, targetTimestamp, ratio);
    }

    return lastFrame;
  }

  private interpolateFrames(
    before: Frame,
    after: Frame,
    timestamp: number,
    ratio: number,
  ): Frame {
    const landmarkCount = Math.min(
      before.landmarks.length,
      after.landmarks.length,
    );
    const landmarks = Array.from({ length: landmarkCount }, (_, index) => {
      const left = before.landmarks[index];
      const right = after.landmarks[index];
      return {
        x: this.lerp(left.x, right.x, ratio),
        y: this.lerp(left.y, right.y, ratio),
        z: this.lerp(left.z, right.z, ratio),
        visibility:
          left.visibility === undefined || right.visibility === undefined
            ? undefined
            : this.lerp(left.visibility, right.visibility, ratio),
      };
    });

    return { timestamp, landmarks };
  }

  private lerp(start: number, end: number, ratio: number): number {
    return start + (end - start) * ratio;
  }

  /**
   * Normalize a frame based on the configuration
   */
  private normalizeFrame(frame: Frame): Frame {
    let normalized = frame;

    if (this.config.normalization.center) {
      normalized = centerNormalize(normalized);
    }

    if (this.config.normalization.scale) {
      normalized = scaleNormalize(normalized);
    }

    if (this.config.normalization.rotation) {
      normalized = rotationNormalize(normalized);
    }

    return normalized;
  }

  /**
   * Compare two frames and return a combined score
   */
  private compareFrames(reference: Frame, comparison: Frame): number {
    const positionScore = this.calculateEuclideanScore(reference, comparison);
    const angularScore = this.calculateAngularScore(reference, comparison);

    return (
      positionScore * this.config.positionWeight +
      angularScore * this.config.angularWeight
    );
  }

  /**
   * Calculate Euclidean distance-based score between two frames
   */
  private calculateEuclideanScore(reference: Frame, comparison: Frame): number {
    const { landmarks: refLandmarks } = reference;
    const { landmarks: compLandmarks } = comparison;

    if (refLandmarks.length === 0 || compLandmarks.length === 0) {
      return 0;
    }

    const minLength = Math.min(refLandmarks.length, compLandmarks.length);
    let totalWeightedDistance = 0;
    let totalWeight = 0;

    for (let i = 0; i < minLength; i++) {
      const refLandmark = refLandmarks[i];
      const compLandmark = compLandmarks[i];

      // Skip invisible landmarks
      if (
        !isLandmarkVisible(refLandmark, this.config.visibilityThreshold) ||
        !isLandmarkVisible(compLandmark, this.config.visibilityThreshold)
      ) {
        continue;
      }

      const distance = calculateDistance(refLandmark, compLandmark);
      const weight = this.config.landmarkWeights.get(i) ?? 1.0;

      totalWeightedDistance += distance * weight;
      totalWeight += weight;
    }

    if (totalWeight === 0) {
      return 0;
    }

    const avgDistance = totalWeightedDistance / totalWeight;

    // Convert distance to 0-100 percentage score
    // Using exponential decay: score = 100 * e^(-k * distance)
    // where k is chosen to be more lenient (0.5 means distance of 0.5 gives ~78% score)
    const k = 0.5;
    const score = 100 * Math.exp(-k * avgDistance);

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate joint angle similarity score between two frames
   */
  private calculateAngularScore(reference: Frame, comparison: Frame): number {
    const { landmarks: refLandmarks } = reference;
    const { landmarks: compLandmarks } = comparison;

    if (refLandmarks.length < 33 || compLandmarks.length < 33) {
      return 0;
    }

    // Define key joints to compare
    const joints = [
      { name: 'left_elbow', indices: [11, 13, 15] },
      { name: 'right_elbow', indices: [12, 14, 16] },
      { name: 'left_knee', indices: [23, 25, 27] },
      { name: 'right_knee', indices: [24, 26, 28] },
      { name: 'left_hip', indices: [11, 23, 25] },
      { name: 'right_hip', indices: [12, 24, 26] },
    ];

    let totalAngleDifference = 0;
    let validJointCount = 0;

    for (const joint of joints) {
      const [i1, i2, i3] = joint.indices;

      // Check visibility of all three landmarks
      const refVisible =
        isLandmarkVisible(refLandmarks[i1], this.config.visibilityThreshold) &&
        isLandmarkVisible(refLandmarks[i2], this.config.visibilityThreshold) &&
        isLandmarkVisible(refLandmarks[i3], this.config.visibilityThreshold);

      const compVisible =
        isLandmarkVisible(compLandmarks[i1], this.config.visibilityThreshold) &&
        isLandmarkVisible(compLandmarks[i2], this.config.visibilityThreshold) &&
        isLandmarkVisible(compLandmarks[i3], this.config.visibilityThreshold);

      if (!refVisible || !compVisible) {
        continue;
      }

      const refAngle = calculateJointAngle(
        refLandmarks[i1],
        refLandmarks[i2],
        refLandmarks[i3],
      );

      const compAngle = calculateJointAngle(
        compLandmarks[i1],
        compLandmarks[i2],
        compLandmarks[i3],
      );

      const angleDifference = Math.abs(refAngle - compAngle);
      totalAngleDifference += angleDifference;
      validJointCount++;
    }

    if (validJointCount === 0) {
      return 0;
    }

    const avgAngleDifference = totalAngleDifference / validJointCount;

    // Convert angle difference to 0-100 percentage score
    // 0 degrees difference = 100%, 180 degrees difference = 0%
    const score = 100 * (1 - avgAngleDifference / 180);

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate timing score based on video length similarity
   */
  private calculateTimingScore(reference: Video, comparison: Video): number {
    if (reference.frames.length === 0 || comparison.frames.length === 0) {
      return 0;
    }

    const referenceDuration = this.calculateDuration(reference);
    const comparisonDuration = this.calculateDuration(comparison);
    if (referenceDuration > 0 && comparisonDuration > 0) {
      return (
        (Math.min(referenceDuration, comparisonDuration) /
          Math.max(referenceDuration, comparisonDuration)) *
        100
      );
    }

    const ratio =
      Math.min(reference.frames.length, comparison.frames.length) /
      Math.max(reference.frames.length, comparison.frames.length);

    // Convert ratio to 0-100 percentage score
    return ratio * 100;
  }

  private calculateDuration(video: Video): number {
    const frames = this.sortedFrames(video);
    if (frames.length < 2) {
      return 0;
    }
    return Math.max(
      0,
      frames[frames.length - 1].timestamp - frames[0].timestamp,
    );
  }
}
