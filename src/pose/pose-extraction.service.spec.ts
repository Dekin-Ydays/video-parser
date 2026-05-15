import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter } from 'node:events';
import * as childProcess from 'node:child_process';

import { PoseExtractionService } from './pose-extraction.service';
import { PoseExtractionJobRepository } from './pose-extraction-job.repository';

jest.mock('node:child_process', () => ({
  spawn: jest.fn(),
}));

const spawnMock = childProcess.spawn as jest.MockedFunction<
  typeof childProcess.spawn
>;

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
}

function makeChild() {
  const child = new FakeChild();
  return child as unknown as childProcess.ChildProcess;
}

describe('PoseExtractionService error mapping', () => {
  let service: PoseExtractionService;
  const mockJobRepository = {
    save: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    spawnMock.mockReset();
    mockJobRepository.save.mockClear();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PoseExtractionService,
        {
          provide: PoseExtractionJobRepository,
          useValue: mockJobRepository,
        },
      ],
    }).compile();
    service = module.get(PoseExtractionService);
  });

  it('maps ENOENT spawn errors to a friendly message', async () => {
    spawnMock.mockImplementation(() => {
      const child = makeChild();
      setImmediate(() => {
        const err = new Error('spawn python3 ENOENT') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        (child as unknown as EventEmitter).emit('error', err);
      });
      return child;
    });

    await expect(
      service.extract(Buffer.from(''), 'recording.mp4'),
    ).rejects.toThrow(/Python interpreter ".+" not found/);
  });

  it('hints about missing Python deps when stderr says ModuleNotFoundError', async () => {
    spawnMock.mockImplementation(() => {
      const child = makeChild();
      setImmediate(() => {
        child.stderr.emit(
          'data',
          "ModuleNotFoundError: No module named 'cv2'\n",
        );
        (child as unknown as EventEmitter).emit('close', 1);
      });
      return child;
    });

    await expect(
      service.extract(Buffer.from(''), 'recording.mp4'),
    ).rejects.toThrow(/missing Python dependency/);
  });

  it('emits started + failed progress events on a python crash', async () => {
    const events: string[] = [];
    service.progress$.subscribe((evt) => events.push(evt.phase));

    spawnMock.mockImplementation(() => {
      const child = makeChild();
      setImmediate(() => {
        child.stderr.emit(
          'data',
          "ModuleNotFoundError: No module named 'cv2'\n",
        );
        (child as unknown as EventEmitter).emit('close', 1);
      });
      return child;
    });

    await expect(
      service.extract(Buffer.from(''), 'recording.mp4'),
    ).rejects.toThrow();

    expect(events).toContain('started');
    expect(events).toContain('failed');
    expect(mockJobRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'started' }),
    );
    expect(mockJobRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'failed' }),
    );
  });

  it('hints about codec issues when OpenCV cannot open the video', async () => {
    spawnMock.mockImplementation(() => {
      const child = makeChild();
      setImmediate(() => {
        child.stderr.emit(
          'data',
          'error: Could not open video: /tmp/foo.webm\n',
        );
        (child as unknown as EventEmitter).emit('close', 1);
      });
      return child;
    });

    await expect(
      service.extract(Buffer.from(''), 'recording.webm'),
    ).rejects.toThrow(/OpenCV could not decode this format/);
  });
});
