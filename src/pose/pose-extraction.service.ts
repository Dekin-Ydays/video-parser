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

const SUPPRESSED_PYTHON_STDERR_PATTERNS = [
  /^Error in cpuinfo: prctl\(PR_SVE_GET_VL\) failed$/,
  /^INFO: Created TensorFlow Lite XNNPACK delegate for CPU\.$/,
  /^WARNING: All log messages before absl::InitializeLog\(\) is called are written to STDERR$/,
  /^W\d{4} .* inference_feedback_manager\.cc:114] Feedback manager requires a model with a single signature inference\. Disabling support for feedback tensors\.$/,
  /^W\d{4} .* landmark_projection_calculator\.cc:186] Using NORM_RECT without IMAGE_DIMENSIONS is only supported for the square ROI\. Provide IMAGE_DIMENSIONS or use PROJECTION_MATRIX\.$/,
];

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
      const args = [
        '-u',
        this.workerPath,
        inputPath,
        outputPath,
        '--model',
        this.modelPath,
      ];
      const child = spawn(this.pythonBin, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
        },
      });

      this.logger.log(
        `Starting Python worker bin=${this.pythonBin} script=${this.workerPath}`,
      );

      let stderr = '';
      this.pipeWorkerStream(child.stdout, 'stdout');
      this.pipeWorkerStream(child.stderr, 'stderr', (line) => {
        if (!this.shouldSuppressPythonStderr(line)) {
          stderr += `${line}\n`;
        }
      });

      child.on('error', (err) => {
        reject(err);
      });

      child.on('close', (code) => {
        if (code === 0) {
          this.logger.log('Python worker completed successfully');
          resolve();
        } else {
          const trimmedStderr = stderr.trim();
          this.logger.error(
            `Python worker exited with code ${code}${trimmedStderr ? `: ${trimmedStderr}` : ''}`,
          );
          reject(new Error(`Pose extraction failed (exit ${code}): ${stderr}`));
        }
      });
    });
  }

  private pipeWorkerStream(
    stream: NodeJS.ReadableStream | null,
    streamName: 'stdout' | 'stderr',
    onLine?: (line: string) => void,
  ): void {
    if (!stream) {
      return;
    }

    let pending = '';
    stream.on('data', (chunk: Buffer | string) => {
      pending += chunk.toString();
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        onLine?.(trimmed);
        if (streamName === 'stdout') {
          this.logger.log(`[python] ${trimmed}`);
        } else if (!this.shouldSuppressPythonStderr(trimmed)) {
          this.logger.warn(`[python] ${trimmed}`);
        } else {
          this.logger.debug(`[python] suppressed noisy stderr: ${trimmed}`);
        }
      }
    });

    stream.on('end', () => {
      const trimmed = pending.trim();
      if (!trimmed) {
        return;
      }

      onLine?.(trimmed);
      if (streamName === 'stdout') {
        this.logger.log(`[python] ${trimmed}`);
      } else if (!this.shouldSuppressPythonStderr(trimmed)) {
        this.logger.warn(`[python] ${trimmed}`);
      } else {
        this.logger.debug(`[python] suppressed noisy stderr: ${trimmed}`);
      }
    });
  }

  private shouldSuppressPythonStderr(line: string): boolean {
    return SUPPRESSED_PYTHON_STDERR_PATTERNS.some((pattern) =>
      pattern.test(line),
    );
  }
}
