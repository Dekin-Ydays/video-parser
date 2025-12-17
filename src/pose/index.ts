// Main exports for the pose comparison system
export { PoseComparator } from './pose-comparator';
export {
  Landmark,
  Frame,
  Video,
  ScoringResult,
  ScoringStatistics,
  ScoringBreakdown,
  NormalizationOptions,
  ComparatorConfig,
  DEFAULT_COMPARATOR_CONFIG,
} from './pose-comparison.types';
export {
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
  Point3D,
} from './pose-comparison.utils';
export { PoseService } from './pose.service';
export { PoseController } from './pose.controller';
export { MediapipeLandmark, PoseFrame } from './pose.types';
