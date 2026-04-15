#!/usr/bin/env python3
"""
Extract pose landmarks from a video using MediaPipe.

Usage:
    python process_video.py <input_video> <output_json> [--model <path>]

Output JSON schema:
    {
      "fps": float,
      "width": int,
      "height": int,
      "frameCount": int,
      "frames": [
        {
          "index": int,
          "timestampMs": int,
          "landmarks": [{"x": float, "y": float, "z": float, "visibility": float}, ...33],
          "detected": bool
        },
        ...
      ]
    }
"""

import argparse
import json
import os
import sys
from pathlib import Path

import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision


DEFAULT_MODEL_PATH = os.environ.get(
    "MEDIAPIPE_POSE_MODEL",
    str(Path(__file__).parent / "models" / "pose_landmarker_heavy.task"),
)
PROGRESS_EVERY_N_FRAMES = 100


def log(message: str) -> None:
    print(message, flush=True)


def build_landmarker(model_path: str):
    base_options = mp_python.BaseOptions(model_asset_path=model_path)
    options = mp_vision.PoseLandmarkerOptions(
        base_options=base_options,
        running_mode=mp_vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
        output_segmentation_masks=False,
    )
    return mp_vision.PoseLandmarker.create_from_options(options)


def process(input_path: str, output_path: str, model_path: str) -> None:
    if not os.path.isfile(input_path):
        raise FileNotFoundError(f"Input video not found: {input_path}")
    if not os.path.isfile(model_path):
        raise FileNotFoundError(f"MediaPipe model not found: {model_path}")

    log(f"Starting pose extraction input={input_path} output={output_path}")
    log(f"Using model={model_path}")

    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {input_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    log(
        f"Video metadata fps={fps:.2f} width={width} height={height} totalFrames={total_frames}"
    )

    frames_out = []

    with build_landmarker(model_path) as landmarker:
        index = 0
        while True:
            ok, frame_bgr = cap.read()
            if not ok:
                break

            timestamp_ms = int((index / fps) * 1000)
            frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)

            result = landmarker.detect_for_video(mp_image, timestamp_ms)

            landmarks_out = []
            detected = False
            if result.pose_landmarks and len(result.pose_landmarks) > 0:
                detected = True
                for lm in result.pose_landmarks[0]:
                    landmarks_out.append({
                        "x": float(lm.x),
                        "y": float(lm.y),
                        "z": float(lm.z),
                        "visibility": float(lm.visibility),
                    })

            frames_out.append({
                "index": index,
                "timestampMs": timestamp_ms,
                "detected": detected,
                "landmarks": landmarks_out,
            })
            index += 1

            if index % PROGRESS_EVERY_N_FRAMES == 0:
                log(f"Processed {index} frames")

    cap.release()

    payload = {
        "fps": fps,
        "width": width,
        "height": height,
        "frameCount": len(frames_out),
        "totalFramesReported": total_frames,
        "frames": frames_out,
    }

    os.makedirs(os.path.dirname(os.path.abspath(output_path)) or ".", exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(payload, f)

    detected_frames = sum(1 for frame in frames_out if frame["detected"])
    log(
        f"Finished pose extraction frames={len(frames_out)} detectedFrames={detected_frames}"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract pose landmarks from video.")
    parser.add_argument("input", help="Path to input video file")
    parser.add_argument("output", help="Path to output JSON file")
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL_PATH,
        help="Path to MediaPipe pose_landmarker .task model",
    )
    args = parser.parse_args()

    try:
        process(args.input, args.output, args.model)
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
