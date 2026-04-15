# Pose extraction worker

Python CLI that runs MediaPipe PoseLandmarker over a video and emits per-frame landmarks as JSON.

## Setup

```bash
cd video-parser/python
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Download the heavy model (best accuracy, offline batch use-case)
mkdir -p models
curl -L -o models/pose_landmarker_heavy.task \
  https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task
```

## Usage

```bash
python process_video.py input.mp4 output.json
# or specify a different model
python process_video.py input.mp4 output.json --model models/pose_landmarker_lite.task
```

## Output schema

```json
{
  "fps": 30.0,
  "width": 1280,
  "height": 720,
  "frameCount": 300,
  "frames": [
    {
      "index": 0,
      "timestampMs": 0,
      "detected": true,
      "landmarks": [
        { "x": 0.5, "y": 0.4, "z": -0.1, "visibility": 0.98 },
        ...33 entries
      ]
    }
  ]
}
```
