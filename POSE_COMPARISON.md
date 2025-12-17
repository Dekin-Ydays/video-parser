# Pose Comparison Scoring System

A comprehensive system for comparing body poses captured using Google MediaPipe Pose Landmark detection. The system scores how accurately a new video replicates the poses from a reference video.

## Features

- **Translation-invariant**: Position on screen doesn't affect scoring
- **Scale-invariant**: Distance from camera doesn't affect scoring
- **Rotation-invariant** (optional): Facing direction doesn't affect scoring
- **Frame-by-frame comparison**: Detailed per-frame scoring
- **Multiple scoring metrics**: Position-based and angular similarity scoring
- **Configurable weights**: Customize importance of different body parts and metrics

## Installation

The pose comparison system is already integrated into the video-parser project. All necessary dependencies are included.

## Core Components

### 1. Data Structures

#### Landmark
```typescript
interface Landmark {
  x: number;        // Normalized coordinate 0-1
  y: number;        // Normalized coordinate 0-1
  z: number;        // Depth coordinate
  visibility?: number;  // Confidence score 0-1
}
```

#### Frame
```typescript
interface Frame {
  landmarks: Landmark[];  // 33 landmarks from MediaPipe Pose
  timestamp: number;      // Frame timestamp in ms
}
```

#### Video
```typescript
interface Video {
  frames: Frame[];
}
```

#### ScoringResult
```typescript
interface ScoringResult {
  overallScore: number;       // 0-100 percentage
  frameScores: number[];      // Score per frame
  breakdown: {
    positionScore: number;    // Euclidean distance-based score
    angularScore: number;     // Joint angle similarity score
    timingScore: number;      // Video length matching score
    statistics: {
      mean: number;
      min: number;
      max: number;
      variance: number;
    };
  };
}
```

### 2. PoseComparator Class

The main class for comparing pose videos.

```typescript
import { PoseComparator } from './pose/pose-comparator';
import { Video } from './pose/pose-comparison.types';

const comparator = new PoseComparator();
const result = comparator.compareVideos(referenceVideo, comparisonVideo);
```

## Usage

### Basic Usage

```typescript
import { PoseComparator } from './pose/pose-comparator';
import { Video } from './pose/pose-comparison.types';

const comparator = new PoseComparator();

const referenceVideo: Video = {
  frames: [ /* your frames */ ]
};

const comparisonVideo: Video = {
  frames: [ /* your frames */ ]
};

const result = comparator.compareVideos(referenceVideo, comparisonVideo);

console.log('Overall Score:', result.overallScore);
console.log('Position Score:', result.breakdown.positionScore);
console.log('Angular Score:', result.breakdown.angularScore);
```

### Custom Configuration

```typescript
const comparator = new PoseComparator({
  normalization: {
    center: true,      // Center around hip midpoint
    scale: true,       // Normalize shoulder width to 1.0
    rotation: true,    // Align shoulder orientation
  },
  positionWeight: 0.7,    // 70% position, 30% angular
  angularWeight: 0.3,
  visibilityThreshold: 0.6,
  landmarkWeights: new Map([
    [11, 2.0],  // Left shoulder - higher importance
    [12, 2.0],  // Right shoulder - higher importance
    // ... more custom weights
  ]),
});
```

### Using the REST API

The system is integrated into the NestJS application with these endpoints:

#### Get Video Data
```bash
GET /pose/video/:videoId
```

Returns the video with all frames and landmarks.

#### Compare Two Videos
```bash
POST /pose/compare
Content-Type: application/json

{
  "referenceVideoId": "video-id-1",
  "comparisonVideoId": "video-id-2",
  "config": {  // Optional
    "normalization": {
      "center": true,
      "scale": true,
      "rotation": false
    },
    "positionWeight": 0.6,
    "angularWeight": 0.4
  }
}
```

Response:
```json
{
  "overallScore": 87.5,
  "frameScores": [85.2, 89.1, 88.3, 87.0],
  "breakdown": {
    "positionScore": 86.2,
    "angularScore": 89.3,
    "timingScore": 95.0,
    "statistics": {
      "mean": 87.5,
      "min": 82.1,
      "max": 93.4,
      "variance": 12.3
    }
  }
}
```

## Scoring Algorithm

### 1. Normalization

Before comparison, frames are normalized to make the system invariant to position, scale, and optionally rotation.

**Center Normalization:**
- Uses hip landmarks (indices 23, 24) as anchor
- Translates all landmarks so hip center is at (0, 0, 0)

**Scale Normalization:**
- Uses shoulder width (distance between landmarks 11 and 12)
- Normalizes all coordinates so shoulder width = 1.0

**Rotation Normalization:**
- Uses shoulder line to determine body orientation
- Rotates all landmarks to align shoulders horizontally

### 2. Position Score (Euclidean Distance)

Calculates 3D distance between corresponding landmarks with weighted importance:

- Face landmarks (0-10): weight 0.3
- Upper body (11-16): weight 1.5
- Hands (17-22): weight 0.8
- Core/hips (23-24): weight 1.2
- Lower body (25-32): weight 1.8

Score formula: `100 * e^(-2.0 * avgDistance)`

### 3. Angular Score

Compares joint angles at key body joints:
- Left elbow: landmarks [11, 13, 15]
- Right elbow: landmarks [12, 14, 16]
- Left knee: landmarks [23, 25, 27]
- Right knee: landmarks [24, 26, 28]
- Left hip: landmarks [11, 23, 25]
- Right hip: landmarks [12, 24, 26]

Score formula: `100 * (1 - avgAngleDifference / 180)`

### 4. Combined Score

Default weights:
- Position: 60%
- Angular: 40%

## MediaPipe Landmark Indices

The 33 pose landmarks from MediaPipe Pose:

- **0-10**: Face/head landmarks
- **11-16**: Arms (shoulders, elbows, wrists)
- **17-22**: Hands
- **23-24**: Hips
- **25-32**: Legs (knees, ankles, feet)

Key landmarks for normalization:
- 11: Left shoulder
- 12: Right shoulder
- 23: Left hip
- 24: Right hip

## Edge Cases

The system handles:

1. **Different video lengths**: Compares up to shorter video length
2. **Missing landmarks**: Skips landmarks with visibility < threshold
3. **Empty videos**: Returns score of 0
4. **Insufficient landmarks**: Gracefully degrades (e.g., no angular score if < 33 landmarks)

## Expected Score Ranges

Based on testing criteria:

- **Same person, same position**: 95-100%
- **Same person, different position**: 95-100% (with normalization)
- **Same person, similar pose**: 85-95%
- **Same person, moderately different pose**: 60-80%
- **Different person, same pose**: 70-90%
- **Completely different poses**: < 50%

## Testing

Run the test suite:

```bash
npm test
```

Test files:
- `pose-comparison.utils.spec.ts`: Tests for normalization and utility functions
- `pose-comparator.spec.ts`: Tests for the main comparator class

Run example usage:

```bash
npx ts-node src/pose/pose-comparison.example.ts
```

## Configuration Options

### Normalization Options

```typescript
{
  center: boolean;    // Translate to common center point (default: true)
  scale: boolean;     // Normalize body size (default: true)
  rotation: boolean;  // Align body orientation (default: false)
}
```

### Scoring Weights

```typescript
{
  positionWeight: number;  // Weight for position score (default: 0.6)
  angularWeight: number;   // Weight for angular score (default: 0.4)
  visibilityThreshold: number;  // Min visibility to include landmark (default: 0.5)
}
```

### Landmark Weights

Customize importance of individual landmarks:

```typescript
{
  landmarkWeights: new Map([
    [0, 0.3],   // Nose
    [11, 1.5],  // Left shoulder
    [12, 1.5],  // Right shoulder
    // ... etc
  ])
}
```

## Performance Considerations

- Frames are processed sequentially
- Normalization is cached per comparison
- Database queries fetch frames in chronological order
- Large videos are compared only up to the shorter video's length

## Integration with Existing Code

The pose comparison system integrates with:

1. **PoseService**: Provides `compareVideos()` and `getVideoById()` methods
2. **PoseController**: Exposes REST endpoints for comparison
3. **Database**: Reads frame data from Prisma-managed SQLite database
4. **WebSocket**: Can be extended to provide real-time comparison

## Example Output

```json
{
  "overallScore": 87.5,
  "frameScores": [85.2, 89.1, 88.3, 87.0, 86.5],
  "breakdown": {
    "positionScore": 86.2,
    "angularScore": 89.3,
    "timingScore": 95.0,
    "statistics": {
      "mean": 87.5,
      "min": 82.1,
      "max": 93.4,
      "variance": 12.3
    }
  }
}
```

## Future Enhancements

Potential additions (not yet implemented):

1. Real-time scoring as frames arrive
2. Temporal smoothing with moving averages
3. Keypoint detection for critical moments
4. Visual debugging with comparison visualizations
5. Dynamic Time Warping for different-speed videos
6. Export detailed reports as JSON/CSV

## Troubleshooting

**Low scores for identical poses:**
- Check that normalization is enabled
- Verify landmark visibility values
- Ensure timestamps are in correct order

**Inconsistent scores:**
- Check for missing z-coordinates
- Verify all 33 landmarks are present
- Adjust visibility threshold

**Performance issues:**
- Consider processing frames in batches
- Cache normalized frames for multiple comparisons
- Use database indexing for frame queries

## License

This implementation is part of the video-parser project.
