import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { promises as fs, existsSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Subject } from 'rxjs';

import type { PoseFrame, MediapipeLandmark } from './types/pose.types';
import { PoseExtractionJobRepository } from './pose-extraction-job.repository';
import { parsePoseFrame } from './utils/pose-frame.parser';

export interface ExtractionProgressEvent {
  jobId: string;
  phase: 'started' | 'frames' | 'completed' | 'failed';
  framesProcessed?: number;
  totalFrames?: number;
  error?: string;
  at: number;
}

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

function resolveProjectPath(relative: string): string {
  const candidates = [
    path.resolve(__dirname, '../../', relative),
    path.resolve(__dirname, '../../../', relative),
    path.resolve(__dirname, '../../../../', relative),
    path.resolve(process.cwd(), relative),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[candidates.length - 1];
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

export interface PoseExtractionHealth {
  ready: boolean;
  workerScript: { path: string; present: boolean };
  model: { path: string; present: boolean };
  pythonBin: string;
}

@Injectable()
export class PoseExtractionService implements OnModuleInit {
  private readonly logger = new Logger(PoseExtractionService.name);

  private readonly pythonBin = process.env.PYTHON_BIN ?? 'python3';
  private readonly workerPath =
    process.env.POSE_WORKER_SCRIPT ??
    resolveProjectPath('python/process_video.py');
  private readonly modelPath =
    process.env.MEDIAPIPE_POSE_MODEL ??
    resolveProjectPath('python/models/pose_landmarker_heavy.task');

  private readonly progressSubject = new Subject<ExtractionProgressEvent>();
  readonly progress$ = this.progressSubject.asObservable();

  constructor(private readonly jobRepository: PoseExtractionJobRepository) {}

  onModuleInit(): void {
    if (!existsSync(this.workerPath)) {
      this.logger.error(
        `Python pose worker not found at ${this.workerPath}. ` +
          `Set POSE_WORKER_SCRIPT or restore video-parser/python/process_video.py.`,
      );
    }
    if (!existsSync(this.modelPath)) {
      this.logger.error(
        `MediaPipe heavy pose model not found at ${this.modelPath}. ` +
          `Download it via: curl -L -o "${this.modelPath}" ` +
          `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task ` +
          `or set MEDIAPIPE_POSE_MODEL.`,
      );
    }
  }

  getHealth(): PoseExtractionHealth {
    const workerPresent = existsSync(this.workerPath);
    const modelPresent = existsSync(this.modelPath);
    return {
      ready: workerPresent && modelPresent,
      workerScript: { path: this.workerPath, present: workerPresent },
      model: { path: this.modelPath, present: modelPresent },
      pythonBin: this.pythonBin,
    };
  }

  async extract(
    buffer: Buffer,
    originalName: string,
    providedJobId?: string,
  ): Promise<ExtractedVideo> {
    const jobId = providedJobId ?? randomUUID();
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pose-'));
    const ext = path.extname(originalName) || '.mp4';
    const videoPath = path.join(tmpDir, `input-${randomUUID()}${ext}`);
    const outputPath = path.join(tmpDir, `output-${randomUUID()}.json`);

    await this.emitProgressAndWait({ jobId, phase: 'started', at: Date.now() });

    try {
      await fs.writeFile(videoPath, buffer);

      await this.runPython(videoPath, outputPath, jobId);

      const raw = await fs.readFile(outputPath, 'utf-8');
      const parsed = JSON.parse(raw) as PythonOutput;

      const frames: PoseFrame[] = parsed.frames
        .filter((f) => f.detected && f.landmarks.length > 0)
        .map((f) =>
          parsePoseFrame({
            timestamp: f.timestampMs,
            type: 'video-extracted',
            landmarks: f.landmarks,
          }),
        )
        .filter((frame): frame is PoseFrame => frame !== null);

      await this.emitProgressAndWait({
        jobId,
        phase: 'completed',
        framesProcessed: parsed.frameCount,
        totalFrames: parsed.frameCount,
        at: Date.now(),
      });

      return {
        fps: parsed.fps,
        width: parsed.width,
        height: parsed.height,
        frames,
      };
    } catch (err) {
      await this.emitProgressAndWait({
        jobId,
        phase: 'failed',
        error: err instanceof Error ? err.message : String(err),
        at: Date.now(),
      });
      throw err;
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private emitProgress(event: ExtractionProgressEvent): void {
    this.progressSubject.next(event);
    void this.persistProgress(event);
  }

  private async emitProgressAndWait(
    event: ExtractionProgressEvent,
  ): Promise<void> {
    this.progressSubject.next(event);
    await this.persistProgress(event);
  }

  private async persistProgress(event: ExtractionProgressEvent): Promise<void> {
    try {
      await this.jobRepository.save(event);
    } catch (error) {
      this.logger.warn(
        `Failed to persist extraction progress jobId=${event.jobId} phase=${event.phase}`,
        error,
      );
    }
  }

  private runPython(
    inputPath: string,
    outputPath: string,
    jobId?: string,
  ): Promise<void> {
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
      let totalFrames: number | undefined;
      this.pipeWorkerStream(child.stdout, 'stdout', (line) => {
        if (!jobId) return;
        const totalMatch = /totalFrames=(\d+)/.exec(line);
        if (totalMatch) {
          totalFrames = Number(totalMatch[1]);
        }
        const progressMatch = /^Processed (\d+) frames$/.exec(line);
        if (progressMatch) {
          this.emitProgress({
            jobId,
            phase: 'frames',
            framesProcessed: Number(progressMatch[1]),
            totalFrames,
            at: Date.now(),
          });
        }
      });
      this.pipeWorkerStream(child.stderr, 'stderr', (line) => {
        if (!this.shouldSuppressPythonStderr(line)) {
          stderr += `${line}\n`;
        }
      });

      child.on('error', (err) => {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(
            new Error(
              `Python interpreter "${this.pythonBin}" not found. ` +
                `Install Python 3.11+ and the dependencies in video-parser/python/requirements.txt, ` +
                `or set PYTHON_BIN to a valid interpreter path.`,
            ),
          );
          return;
        }
        reject(err);
      });

      child.on('close', (code) => {
        if (code === 0) {
          this.logger.log('Python worker completed successfully');
          resolve();
          return;
        }

        const trimmedStderr = stderr.trim();
        this.logger.error(
          `Python worker exited with code ${code}${trimmedStderr ? `: ${trimmedStderr}` : ''}`,
        );

        let hint = '';
        if (/ModuleNotFoundError|No module named/.test(trimmedStderr)) {
          hint =
            ' (missing Python dependency — run `pip install -r video-parser/python/requirements.txt`)';
        } else if (/Could not open video/.test(trimmedStderr)) {
          hint =
            ' (OpenCV could not decode this format — ensure the upload is a valid mp4/webm with codecs supported by FFmpeg)';
        } else if (/MediaPipe model not found/.test(trimmedStderr)) {
          hint = ` (heavy pose model missing at ${this.modelPath})`;
        }

        reject(
          new Error(
            `Pose extraction failed (exit ${code})${hint}: ${trimmedStderr || '(no stderr)'}`,
          ),
        );
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
