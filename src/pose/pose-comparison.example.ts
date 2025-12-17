import { PoseComparator } from './pose-comparator';
import { Video, Frame, Landmark } from './pose-comparison.types';

/**
 * Example usage of the PoseComparator class
 */

function createExampleFrame(variation: number = 0): Frame {
  const landmarks: Landmark[] = [];

  for (let i = 0; i < 33; i++) {
    landmarks.push({
      x: Math.sin(i * 0.1) + variation,
      y: Math.cos(i * 0.1) + variation,
      z: Math.sin(i * 0.2) + variation,
      visibility: 0.95,
    });
  }

  landmarks[11] = { x: -0.5 + variation, y: 0, z: 0, visibility: 1 };
  landmarks[12] = { x: 0.5 + variation, y: 0, z: 0, visibility: 1 };
  landmarks[23] = { x: -0.25 + variation, y: -1, z: 0, visibility: 1 };
  landmarks[24] = { x: 0.25 + variation, y: -1, z: 0, visibility: 1 };

  return {
    landmarks,
    timestamp: Date.now(),
  };
}

function example1_identicalPoses() {
  console.log('\n=== Example 1: Comparing identical poses ===');

  const comparator = new PoseComparator();

  const referenceVideo: Video = {
    frames: [
      createExampleFrame(0),
      createExampleFrame(0),
      createExampleFrame(0),
    ],
  };

  const comparisonVideo: Video = {
    frames: [
      createExampleFrame(0),
      createExampleFrame(0),
      createExampleFrame(0),
    ],
  };

  const result = comparator.compareVideos(referenceVideo, comparisonVideo);

  console.log('Overall Score:', result.overallScore.toFixed(2), '%');
  console.log(
    'Position Score:',
    result.breakdown.positionScore.toFixed(2),
    '%',
  );
  console.log('Angular Score:', result.breakdown.angularScore.toFixed(2), '%');
  console.log('Timing Score:', result.breakdown.timingScore.toFixed(2), '%');
  console.log(
    'Frame Scores:',
    result.frameScores.map((s) => s.toFixed(2)),
  );
  console.log('Statistics:', {
    mean: result.breakdown.statistics.mean.toFixed(2),
    min: result.breakdown.statistics.min.toFixed(2),
    max: result.breakdown.statistics.max.toFixed(2),
    variance: result.breakdown.statistics.variance.toFixed(2),
  });
}

function example2_differentPositions() {
  console.log('\n=== Example 2: Same pose, different screen positions ===');

  const comparator = new PoseComparator();

  const referenceVideo: Video = {
    frames: [createExampleFrame(0), createExampleFrame(0)],
  };

  const comparisonVideo: Video = {
    frames: [createExampleFrame(5), createExampleFrame(5)],
  };

  const result = comparator.compareVideos(referenceVideo, comparisonVideo);

  console.log('Overall Score:', result.overallScore.toFixed(2), '%');
  console.log(
    'Note: High score despite different positions due to normalization',
  );
}

function example3_differentPoses() {
  console.log('\n=== Example 3: Different poses ===');

  const comparator = new PoseComparator();

  const referenceVideo: Video = {
    frames: [createExampleFrame(0)],
  };

  const frame2 = createExampleFrame(0);
  frame2.landmarks[13] = { x: 10, y: 10, z: 10, visibility: 1 };
  frame2.landmarks[14] = { x: 10, y: 10, z: 10, visibility: 1 };

  const comparisonVideo: Video = {
    frames: [frame2],
  };

  const result = comparator.compareVideos(referenceVideo, comparisonVideo);

  console.log('Overall Score:', result.overallScore.toFixed(2), '%');
  console.log('Note: Lower score due to different elbow positions');
}

function example4_customConfiguration() {
  console.log('\n=== Example 4: Custom configuration ===');

  const comparator = new PoseComparator({
    normalization: {
      center: true,
      scale: true,
      rotation: true,
    },
    positionWeight: 0.8,
    angularWeight: 0.2,
    visibilityThreshold: 0.7,
  });

  const referenceVideo: Video = {
    frames: [createExampleFrame(0)],
  };

  const comparisonVideo: Video = {
    frames: [createExampleFrame(0)],
  };

  const result = comparator.compareVideos(referenceVideo, comparisonVideo);

  console.log('Overall Score:', result.overallScore.toFixed(2), '%');
  console.log(
    'Note: Using custom weights (80% position, 20% angular) and rotation normalization',
  );
}

function example5_differentLengths() {
  console.log('\n=== Example 5: Videos of different lengths ===');

  const comparator = new PoseComparator();

  const referenceVideo: Video = {
    frames: [
      createExampleFrame(0),
      createExampleFrame(0),
      createExampleFrame(0),
    ],
  };

  const comparisonVideo: Video = {
    frames: [createExampleFrame(0)],
  };

  const result = comparator.compareVideos(referenceVideo, comparisonVideo);

  console.log('Overall Score:', result.overallScore.toFixed(2), '%');
  console.log('Timing Score:', result.breakdown.timingScore.toFixed(2), '%');
  console.log('Note: Timing score reflects length difference (1 vs 3 frames)');
}

if (require.main === module) {
  console.log('Pose Comparison System - Example Usage\n');
  console.log('='.repeat(60));

  example1_identicalPoses();
  example2_differentPositions();
  example3_differentPoses();
  example4_customConfiguration();
  example5_differentLengths();

  console.log('\n' + '='.repeat(60));
  console.log('\nExamples completed!');
}

export {
  example1_identicalPoses,
  example2_differentPositions,
  example3_differentPoses,
  example4_customConfiguration,
  example5_differentLengths,
};
