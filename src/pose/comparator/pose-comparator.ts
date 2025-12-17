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
    const minLength = Math.min(
      reference.frames.length,
      comparison.frames.length,
    );

    if (minLength === 0) {
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

    for (let i = 0; i < minLength; i++) {
      const refFrame = this.normalizeFrame(reference.frames[i]);
      const compFrame = this.normalizeFrame(comparison.frames[i]);

      const frameScore = this.compareFrames(refFrame, compFrame);
      frameScores.push(frameScore);

      // Calculate component scores for breakdown
      const posScore = this.calculateEuclideanScore(refFrame, compFrame);
      const angScore = this.calculateAngularScore(refFrame, compFrame);

      totalPositionScore += posScore;
      totalAngularScore += angScore;
    }

    // Calculate timing score
    const timingScore = this.calculateTimingScore(
      reference.frames.length,
      comparison.frames.length,
    );

    // Calculate statistics
    const statistics = calculateStatistics(frameScores);

    // Calculate breakdown scores
    const avgPositionScore = totalPositionScore / minLength;
    const avgAngularScore = totalAngularScore / minLength;

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
    // where k is chosen so that distance of 0.5 gives ~60% score
    const k = 2.0;
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
  private calculateTimingScore(
    referenceLength: number,
    comparisonLength: number,
  ): number {
    if (referenceLength === 0 || comparisonLength === 0) {
      return 0;
    }

    const ratio =
      Math.min(referenceLength, comparisonLength) /
      Math.max(referenceLength, comparisonLength);

    // Convert ratio to 0-100 percentage score
    return ratio * 100;
  }
}
