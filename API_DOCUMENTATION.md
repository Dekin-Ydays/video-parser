# Video Parser API Documentation

API documentation for the pose comparison and video streaming service.

## Base URL

```
http://localhost:3000
```

## Endpoints

### 1. List Connected Clients

Get a list of all connected WebSocket clients and their last seen timestamp.

**Endpoint:** `GET /pose/clients`

**Response:**
```json
[
  {
    "clientId": "client-uuid-123",
    "lastSeenAt": 1702825600000
  }
]
```

**Example:**
```bash
curl http://localhost:3000/pose/clients
```

```javascript
const response = await fetch('http://localhost:3000/pose/clients');
const clients = await response.json();
```

---

### 2. Get Latest Pose Frame

Get the most recent pose frame for a specific client.

**Endpoint:** `GET /pose/latest/:clientId`

**Parameters:**
- `clientId` (string, required): The client identifier

**Response:**
```json
{
  "timestamp": 1702825600000,
  "landmarks": [
    {
      "x": 0.5,
      "y": 0.5,
      "z": -0.1,
      "visibility": 0.95,
      "presence": 0.98
    }
    // ... 33 landmarks total
  ],
  "rawType": "pose"
}
```

**Errors:**
- `404 Not Found`: No pose data available for the specified client

**Example:**
```bash
curl http://localhost:3000/pose/latest/client-uuid-123
```

```javascript
const response = await fetch('http://localhost:3000/pose/latest/client-uuid-123');
if (response.ok) {
  const poseFrame = await response.json();
  console.log('Latest pose:', poseFrame);
} else {
  console.error('No pose data found');
}
```

---

### 3. Get Video by ID

Retrieve a complete video with all frames and landmarks.

**Endpoint:** `GET /pose/video/:videoId`

**Parameters:**
- `videoId` (string, required): The video identifier from the database

**Response:**
```json
{
  "frames": [
    {
      "landmarks": [
        {
          "x": 0.5,
          "y": 0.5,
          "z": -0.1,
          "visibility": 0.95
        }
        // ... 33 landmarks
      ],
      "timestamp": 1702825600000
    },
    {
      "landmarks": [ /* ... */ ],
      "timestamp": 1702825600033
    }
    // ... more frames
  ]
}
```

**Errors:**
- `404 Not Found`: Video not found

**Example:**
```bash
curl http://localhost:3000/pose/video/cm4xwvzzz0001ux5p5jhpqk6s
```

```javascript
const response = await fetch('http://localhost:3000/pose/video/cm4xwvzzz0001ux5p5jhpqk6s');
if (response.ok) {
  const video = await response.json();
  console.log(`Video has ${video.frames.length} frames`);
} else {
  console.error('Video not found');
}
```

---

### 4. Compare Two Videos

Compare two pose videos and get a comprehensive scoring result.

**Endpoint:** `POST /pose/compare`

**Request Body:**
```json
{
  "referenceVideoId": "cm4xwvzzz0001ux5p5jhpqk6s",
  "comparisonVideoId": "cm4xwvzzz0002ux5p5jhpqk7t",
  "config": {
    "normalization": {
      "center": true,
      "scale": true,
      "rotation": false
    },
    "positionWeight": 0.6,
    "angularWeight": 0.4,
    "visibilityThreshold": 0.5
  }
}
```

**Request Fields:**
- `referenceVideoId` (string, required): The reference/teacher video ID
- `comparisonVideoId` (string, required): The comparison/student video ID
- `config` (object, optional): Custom comparison configuration
  - `normalization` (object, optional): Normalization settings
    - `center` (boolean): Center poses around hip point (default: true)
    - `scale` (boolean): Normalize body size (default: true)
    - `rotation` (boolean): Align body rotation (default: false)
  - `positionWeight` (number): Weight for position score 0-1 (default: 0.6)
  - `angularWeight` (number): Weight for angular score 0-1 (default: 0.4)
  - `visibilityThreshold` (number): Min visibility to include landmark 0-1 (default: 0.5)

**Response:**
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

**Response Fields:**
- `overallScore` (number): Combined score from 0-100
- `frameScores` (number[]): Individual score for each frame
- `breakdown` (object): Detailed breakdown
  - `positionScore` (number): Average position similarity 0-100
  - `angularScore` (number): Average joint angle similarity 0-100
  - `timingScore` (number): Video length matching 0-100
  - `statistics` (object): Statistical analysis
    - `mean` (number): Average of all frame scores
    - `min` (number): Lowest frame score
    - `max` (number): Highest frame score
    - `variance` (number): Score variance

**Errors:**
- `404 Not Found`: One or both videos not found

**Example:**
```bash
curl -X POST http://localhost:3000/pose/compare \
  -H "Content-Type: application/json" \
  -d '{
    "referenceVideoId": "cm4xwvzzz0001ux5p5jhpqk6s",
    "comparisonVideoId": "cm4xwvzzz0002ux5p5jhpqk7t"
  }'
```

```javascript
const response = await fetch('http://localhost:3000/pose/compare', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    referenceVideoId: 'cm4xwvzzz0001ux5p5jhpqk6s',
    comparisonVideoId: 'cm4xwvzzz0002ux5p5jhpqk7t',
    config: {
      normalization: {
        center: true,
        scale: true,
        rotation: false,
      },
      positionWeight: 0.7,
      angularWeight: 0.3,
    },
  }),
});

if (response.ok) {
  const result = await response.json();
  console.log(`Overall score: ${result.overallScore.toFixed(1)}%`);
  console.log(`Position: ${result.breakdown.positionScore.toFixed(1)}%`);
  console.log(`Angular: ${result.breakdown.angularScore.toFixed(1)}%`);
} else {
  console.error('Comparison failed');
}
```

---

## WebSocket Connection

Connect to the WebSocket server to stream pose data in real-time.

**Endpoint:** `ws://localhost:3000`

### Connection

```javascript
const ws = new WebSocket('ws://localhost:3000');

ws.onopen = () => {
  console.log('Connected to pose server');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received pose data:', data);
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('Disconnected from pose server');
};
```

### Sending Pose Data

Send pose frames to the server:

```javascript
const poseFrame = {
  timestamp: Date.now(),
  landmarks: [
    { x: 0.5, y: 0.5, z: -0.1, visibility: 0.95 },
    // ... 33 landmarks
  ],
};

ws.send(JSON.stringify(poseFrame));
```

**Expected Format:**
```json
{
  "timestamp": 1702825600000,
  "landmarks": [
    {
      "x": 0.5,
      "y": 0.5,
      "z": -0.1,
      "visibility": 0.95
    }
  ]
}
```

The server automatically:
- Stores frames in the database
- Links frames to a video session
- Makes latest frame available via REST API

---

## Understanding the Scores

### Overall Score (0-100)

The combined score representing how well the comparison video matches the reference.

**Interpretation:**
- **95-100%**: Nearly perfect match
- **85-95%**: Very good match, minor differences
- **70-85%**: Good match, noticeable differences
- **50-70%**: Moderate match, significant differences
- **<50%**: Poor match, very different poses

### Position Score (0-100)

Measures 3D spatial similarity of body landmarks using Euclidean distance.

**Normalization:** Automatically adjusts for:
- Screen position (centering)
- Camera distance (scaling)
- Body orientation (optional rotation)

**Weighted Landmarks:**
- Face: 0.3× (less important)
- Upper body (shoulders, arms): 1.5× (important)
- Core/hips: 1.2× (important)
- Lower body (legs): 1.8× (most important)
- Hands: 0.8× (moderate importance)

### Angular Score (0-100)

Measures joint angle similarity at key body joints.

**Joints Compared:**
- Left/right elbows
- Left/right knees
- Left/right hips

**Good for:** Detecting whether limbs are bent at the correct angles, independent of body position.

### Timing Score (0-100)

Measures how closely video lengths match.

**Formula:** `(shorter length / longer length) × 100`

**Example:**
- Same length (30 frames / 30 frames): 100%
- Close (28 frames / 30 frames): 93.3%
- Different (10 frames / 30 frames): 33.3%

### Frame Scores

Individual scores for each frame in the comparison.

**Use cases:**
- Identify which moments had the best/worst match
- Show frame-by-frame progress
- Highlight specific poses that need improvement

---

## MediaPipe Landmark Structure

Each pose frame contains 33 landmarks from Google MediaPipe Pose:

```
Landmarks 0-10:   Face and head
Landmarks 11-16:  Arms (shoulders, elbows, wrists)
Landmarks 17-22:  Hands (fingers, palms)
Landmarks 23-24:  Hips
Landmarks 25-32:  Legs (knees, ankles, feet)
```

**Key Landmarks:**
- `11`: Left shoulder
- `12`: Right shoulder
- `13`: Left elbow
- `14`: Right elbow
- `15`: Left wrist
- `16`: Right wrist
- `23`: Left hip
- `24`: Right hip
- `25`: Left knee
- `26`: Right knee
- `27`: Left ankle
- `28`: Right ankle

**Coordinate System:**
- `x`: Horizontal position (0-1, normalized to image width)
- `y`: Vertical position (0-1, normalized to image height)
- `z`: Depth (negative = toward camera, positive = away from camera)
- `visibility`: Confidence that landmark is visible (0-1)
- `presence`: Confidence that landmark is in frame (0-1)

---

## Frontend Integration Examples

### React Component - Video Comparison

```jsx
import { useState } from 'react';

function VideoComparison() {
  const [referenceId, setReferenceId] = useState('');
  const [comparisonId, setComparisonId] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const compareVideos = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:3000/pose/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceVideoId: referenceId,
          comparisonVideoId: comparisonId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setResult(data);
      }
    } catch (error) {
      console.error('Comparison failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <input
        value={referenceId}
        onChange={(e) => setReferenceId(e.target.value)}
        placeholder="Reference Video ID"
      />
      <input
        value={comparisonId}
        onChange={(e) => setComparisonId(e.target.value)}
        placeholder="Comparison Video ID"
      />
      <button onClick={compareVideos} disabled={loading}>
        {loading ? 'Comparing...' : 'Compare Videos'}
      </button>

      {result && (
        <div>
          <h2>Results</h2>
          <p>Overall Score: {result.overallScore.toFixed(1)}%</p>
          <p>Position: {result.breakdown.positionScore.toFixed(1)}%</p>
          <p>Angular: {result.breakdown.angularScore.toFixed(1)}%</p>
          <p>Timing: {result.breakdown.timingScore.toFixed(1)}%</p>
        </div>
      )}
    </div>
  );
}
```

### Real-time Pose Streaming

```javascript
class PoseStreamer {
  constructor(serverUrl = 'ws://localhost:3000') {
    this.ws = new WebSocket(serverUrl);
    this.setupListeners();
  }

  setupListeners() {
    this.ws.onopen = () => {
      console.log('Connected to pose server');
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('Disconnected from server');
    };
  }

  sendPose(landmarks) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        timestamp: Date.now(),
        landmarks: landmarks,
      }));
    }
  }

  disconnect() {
    this.ws.close();
  }
}

// Usage with MediaPipe
const streamer = new PoseStreamer();

function onPoseResults(results) {
  if (results.poseLandmarks) {
    streamer.sendPose(results.poseLandmarks);
  }
}
```

### Score Visualization Component

```jsx
function ScoreVisualization({ result }) {
  const getScoreColor = (score) => {
    if (score >= 90) return 'green';
    if (score >= 70) return 'yellow';
    if (score >= 50) return 'orange';
    return 'red';
  };

  const getScoreLabel = (score) => {
    if (score >= 90) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Fair';
    return 'Needs Improvement';
  };

  return (
    <div className="score-panel">
      <div className="overall-score">
        <h2 style={{ color: getScoreColor(result.overallScore) }}>
          {result.overallScore.toFixed(1)}%
        </h2>
        <p>{getScoreLabel(result.overallScore)}</p>
      </div>

      <div className="breakdown">
        <div className="score-item">
          <span>Position</span>
          <div className="progress-bar">
            <div
              style={{
                width: `${result.breakdown.positionScore}%`,
                backgroundColor: getScoreColor(result.breakdown.positionScore),
              }}
            />
          </div>
          <span>{result.breakdown.positionScore.toFixed(1)}%</span>
        </div>

        <div className="score-item">
          <span>Joint Angles</span>
          <div className="progress-bar">
            <div
              style={{
                width: `${result.breakdown.angularScore}%`,
                backgroundColor: getScoreColor(result.breakdown.angularScore),
              }}
            />
          </div>
          <span>{result.breakdown.angularScore.toFixed(1)}%</span>
        </div>

        <div className="score-item">
          <span>Timing</span>
          <div className="progress-bar">
            <div
              style={{
                width: `${result.breakdown.timingScore}%`,
                backgroundColor: getScoreColor(result.breakdown.timingScore),
              }}
            />
          </div>
          <span>{result.breakdown.timingScore.toFixed(1)}%</span>
        </div>
      </div>

      <div className="frame-scores">
        <h3>Frame-by-Frame Scores</h3>
        <div className="chart">
          {result.frameScores.map((score, index) => (
            <div
              key={index}
              className="bar"
              style={{
                height: `${score}%`,
                backgroundColor: getScoreColor(score),
              }}
              title={`Frame ${index + 1}: ${score.toFixed(1)}%`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

---

## Error Handling

All endpoints return standard HTTP status codes:

- `200 OK`: Request successful
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

**Error Response Format:**
```json
{
  "statusCode": 404,
  "message": "Video not found",
  "error": "Not Found"
}
```

**Frontend Error Handling:**
```javascript
async function compareVideos(refId, compId) {
  try {
    const response = await fetch('http://localhost:3000/pose/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        referenceVideoId: refId,
        comparisonVideoId: compId,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Comparison failed');
    }

    return await response.json();
  } catch (error) {
    console.error('Error comparing videos:', error);
    throw error;
  }
}
```

---

## Configuration Tips

### For Dance/Choreography
```json
{
  "normalization": {
    "center": true,
    "scale": true,
    "rotation": false
  },
  "positionWeight": 0.5,
  "angularWeight": 0.5
}
```

### For Yoga/Static Poses
```json
{
  "normalization": {
    "center": true,
    "scale": true,
    "rotation": true
  },
  "positionWeight": 0.4,
  "angularWeight": 0.6
}
```

### For Sports Form Analysis
```json
{
  "normalization": {
    "center": true,
    "scale": true,
    "rotation": false
  },
  "positionWeight": 0.7,
  "angularWeight": 0.3,
  "visibilityThreshold": 0.7
}
```

---

## Rate Limits

Currently no rate limits are enforced. For production, consider implementing:
- Max requests per client per minute
- Max video comparisons per session
- WebSocket message throttling

---

## Support

For issues or questions:
- Check the main documentation in `POSE_COMPARISON.md`
- Review example code in `src/pose/pose-comparison.example.ts`
- Run tests with `npm test`

---

## Changelog

### v1.0.0 (Current)
- Initial release
- Video comparison with position and angular scoring
- WebSocket streaming support
- Configurable normalization and weights
- Frame-by-frame analysis
