import { MediapipeLandmark } from './pose.types';

export interface Landmark extends MediapipeLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface Frame {
  landmarks: Landmark[];
  timestamp: number;
}

export interface Video {
  frames: Frame[];
}

export interface ScoringStatistics {
  mean: number;
  min: number;
  max: number;
  variance: number;
}

export interface ScoringBreakdown {
  positionScore: number;
  angularScore: number;
  timingScore: number;
  statistics: ScoringStatistics;
}

export interface ScoringResult {
  overallScore: number;
  frameScores: number[];
  breakdown: ScoringBreakdown;
}

export interface NormalizationOptions {
  center: boolean;
  scale: boolean;
  rotation: boolean;
}

export interface ComparatorConfig {
  normalization?: Partial<NormalizationOptions>;
  landmarkWeights?: Map<number, number>;
  positionWeight?: number;
  angularWeight?: number;
  visibilityThreshold?: number;
}

export const DEFAULT_COMPARATOR_CONFIG: Required<
  Omit<ComparatorConfig, 'landmarkWeights'>
> & { landmarkWeights: Map<number, number> } = {
  normalization: {
    center: true,
    scale: true,
    rotation: false,
  },
  landmarkWeights: new Map([
    // Face landmarks (0-10): weight 0.3
    [0, 0.3],
    [1, 0.3],
    [2, 0.3],
    [3, 0.3],
    [4, 0.3],
    [5, 0.3],
    [6, 0.3],
    [7, 0.3],
    [8, 0.3],
    [9, 0.3],
    [10, 0.3],
    // Upper body (11-16): weight 1.5
    [11, 1.5],
    [12, 1.5],
    [13, 1.5],
    [14, 1.5],
    [15, 1.5],
    [16, 1.5],
    // Hands (17-22): weight 0.8
    [17, 0.8],
    [18, 0.8],
    [19, 0.8],
    [20, 0.8],
    [21, 0.8],
    [22, 0.8],
    // Core/hips (23-24): weight 1.2
    [23, 1.2],
    [24, 1.2],
    // Lower body (25-32): weight 1.8
    [25, 1.8],
    [26, 1.8],
    [27, 1.8],
    [28, 1.8],
    [29, 1.8],
    [30, 1.8],
    [31, 1.8],
    [32, 1.8],
  ]),
  positionWeight: 0.6,
  angularWeight: 0.4,
  visibilityThreshold: 0.5,
};
