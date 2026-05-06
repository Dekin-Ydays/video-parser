/**
 * Real-pipeline integration test for PoseExtractionService.
 *
 * Skipped unless RUN_PYTHON_INTEGRATION_TEST=1 is set, because it shells out
 * to Python + MediaPipe and needs the heavy model on disk. To run:
 *
 *   RUN_PYTHON_INTEGRATION_TEST=1 \
 *   INTEGRATION_TEST_VIDEO=/abs/path/to/clip.mp4 \
 *   MEDIAPIPE_POSE_MODEL=/abs/path/to/pose_landmarker_heavy.task \
 *   PYTHON_BIN=/abs/path/to/.venv/bin/python \
 *   pnpm run test -- --testPathPattern pose-extraction.integration
 *
 * INTEGRATION_TEST_VIDEO must point to a video the bundled OpenCV+FFmpeg can
 * decode (mp4/avc1 or webm/vp8|vp9 work in practice). The test asserts the
 * pipeline emits started + completed progress and returns at least one
 * detected pose frame.
 */
import { promises as fs } from 'node:fs';
import { Test } from '@nestjs/testing';

import {
  ExtractionProgressEvent,
  PoseExtractionService,
} from './pose-extraction.service';

const enabled = process.env.RUN_PYTHON_INTEGRATION_TEST === '1';
const videoPath = process.env.INTEGRATION_TEST_VIDEO;
const describeMaybe = enabled && videoPath ? describe : describe.skip;

describeMaybe('PoseExtractionService (real python pipeline)', () => {
  jest.setTimeout(120_000);

  it('extracts at least one frame and emits started + completed events', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PoseExtractionService],
    }).compile();
    const service = moduleRef.get(PoseExtractionService);

    const phases: ExtractionProgressEvent['phase'][] = [];
    service.progress$.subscribe((event) => phases.push(event.phase));

    const buffer = await fs.readFile(videoPath as string);
    const result = await service.extract(buffer, 'fixture.mp4');

    expect(result.fps).toBeGreaterThan(0);
    expect(result.frames.length).toBeGreaterThan(0);
    expect(phases[0]).toBe('started');
    expect(phases).toContain('completed');
  });
});
