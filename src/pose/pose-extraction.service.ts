import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

import type { PoseFrame, MediapipeLandmark } from './types/pose.types';

interface PythonFrame {
  index: number;
  timestampMs: number;
  detected: boolean;
  landmarks: MediapipeLandmark[];
}

interface PythonOutput {
  fps: number;
  width: number;
  height: number;
  frameCount: number;
  frames: PythonFrame[];
}

export interface ExtractedVideo {
  fps: number;
  width: number;
  height: number;
  frames: PoseFrame[];
}

@Injectable()
export class PoseExtractionService {
  private readonly logger = new Logger(PoseExtractionService.name);

  private readonly pythonBin = process.env.PYTHON_BIN ?? 'python3';
  private readonly workerPath =
    process.env.POSE_WORKER_SCRIPT ??
    path.resolve(__dirname, '../../python/process_video.py');
  private readonly modelPath =
    process.env.MEDIAPIPE_POSE_MODEL ??
    path.resolve(__dirname, '../../python/models/pose_landmarker_heavy.task');

  async extract(buffer: Buffer, originalName: string): Promise<ExtractedVideo> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pose-'));
    const ext = path.extname(originalName) || '.mp4';
    const videoPath = path.join(tmpDir, `input-${randomUUID()}${ext}`);
    const outputPath = path.join(tmpDir, `output-${randomUUID()}.json`);

    try {
      await fs.writeFile(videoPath, buffer);

      await this.runPython(videoPath, outputPath);

      const raw = await fs.readFile(outputPath, 'utf-8');
      const parsed = JSON.parse(raw) as PythonOutput;

      const frames: PoseFrame[] = parsed.frames
        .filter((f) => f.detected && f.landmarks.length > 0)
        .map((f) => ({
          timestamp: f.timestampMs,
          landmarks: f.landmarks,
          rawType: 'video-extracted',
        }));

      return {
        fps: parsed.fps,
        width: parsed.width,
        height: parsed.height,
        frames,
      };
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private runPython(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [this.workerPath, inputPath, outputPath, '--model', this.modelPath];
      const child = spawn(this.pythonBin, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('error', (err) => {
        reject(err);
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          this.logger.error(`Python worker exited with code ${code}: ${stderr}`);
          reject(new Error(`Pose extraction failed (exit ${code}): ${stderr}`));
        }
      });
    });
  }
}
