import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Subject, firstValueFrom } from 'rxjs';
import { take, toArray } from 'rxjs/operators';
import { PoseController } from './pose.controller';
import { PoseService } from '../pose.service';
import {
  ExtractionProgressEvent,
  PoseExtractionService,
} from '../pose-extraction.service';
import { MinioService } from '../../minio/minio.service';
import { PoseVideoProcessingService } from '../pose-video-processing.service';

describe('PoseController', () => {
  let controller: PoseController;

  const mockPoseService = {
    listClients: jest.fn(),
    listVideos: jest.fn(),
    getLatest: jest.fn(),
    getVideoById: jest.fn(),
    uploadVideoFile: jest.fn(),
    compareVideos: jest.fn(),
  };

  const mockPoseVideoProcessingService = {
    processUploadedVideo: jest.fn(),
  };

  const progressSubject = new Subject<ExtractionProgressEvent>();
  const mockExtractionService = {
    getHealth: jest.fn(),
    progress$: progressSubject.asObservable(),
  };

  const mockMinioService = {
    getStatus: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PoseController],
      providers: [
        {
          provide: PoseService,
          useValue: mockPoseService,
        },
        {
          provide: PoseVideoProcessingService,
          useValue: mockPoseVideoProcessingService,
        },
        {
          provide: PoseExtractionService,
          useValue: mockExtractionService,
        },
        {
          provide: MinioService,
          useValue: mockMinioService,
        },
      ],
    }).compile();

    controller = module.get<PoseController>(PoseController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('compareVideos', () => {
    it('returns result when service succeeds', async () => {
      mockPoseService.compareVideos.mockResolvedValue({
        ok: true,
        result: { overallScore: 88 },
      });

      const result = await controller.compareVideos({
        referenceVideoId: 'a',
        comparisonVideoId: 'b',
      });

      expect(result).toEqual({ overallScore: 88 });
    });

    it('throws bad request when config is invalid', async () => {
      mockPoseService.compareVideos.mockResolvedValue({
        ok: false,
        error: 'invalid_config',
        message: 'Invalid comparator configuration',
      });

      await expect(
        controller.compareVideos({
          referenceVideoId: 'a',
          comparisonVideoId: 'b',
          config: { positionWeight: 'bad' },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws not found when videos are missing', async () => {
      mockPoseService.compareVideos.mockResolvedValue({
        ok: false,
        error: 'not_found',
        message: 'One or both videos were not found',
      });

      await expect(
        controller.compareVideos({
          referenceVideoId: 'a',
          comparisonVideoId: 'b',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws internal error for unexpected service failures', async () => {
      mockPoseService.compareVideos.mockResolvedValue({
        ok: false,
        error: 'internal_error',
        message: 'Failed to compare videos due to an internal error',
      });

      await expect(
        controller.compareVideos({
          referenceVideoId: 'a',
          comparisonVideoId: 'b',
        }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('uploadVideo', () => {
    it('uploads a video file when payload is valid', async () => {
      const file = {
        buffer: Buffer.from('video'),
        originalname: 'demo.mp4',
        mimetype: 'video/mp4',
        size: 5,
      };
      const uploaded = { id: 'video-1', objectKey: 'uploads/video-1/demo.mp4' };
      mockPoseService.uploadVideoFile.mockResolvedValue(uploaded);

      await expect(controller.uploadVideo(file)).resolves.toEqual(uploaded);
      expect(mockPoseService.uploadVideoFile).toHaveBeenCalledWith(file);
    });

    it('rejects missing files', async () => {
      await expect(controller.uploadVideo()).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects non-video mime types', async () => {
      await expect(
        controller.uploadVideo({
          buffer: Buffer.from('text'),
          originalname: 'notes.txt',
          mimetype: 'text/plain',
          size: 4,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('health', () => {
    const extractionPayload = {
      ready: true,
      workerScript: { path: '/x/process_video.py', present: true },
      model: { path: '/x/model.task', present: true },
      pythonBin: 'python3',
    };

    it('combines extraction health with storage status when both ready', () => {
      mockExtractionService.getHealth.mockReturnValue(extractionPayload);
      mockMinioService.getStatus.mockReturnValue({
        ready: true,
        endpoint: 'http://minio:9000',
        bucket: 'videos',
      });

      expect(controller.health()).toEqual({
        ...extractionPayload,
        ready: true,
        storage: {
          ready: true,
          endpoint: 'http://minio:9000',
          bucket: 'videos',
        },
      });
    });

    it('reports overall not ready when storage is unreachable', () => {
      mockExtractionService.getHealth.mockReturnValue(extractionPayload);
      mockMinioService.getStatus.mockReturnValue({
        ready: false,
        endpoint: 'http://localhost:9000',
        bucket: 'videos',
        error: 'ECONNREFUSED',
      });

      const result = controller.health();
      expect(result.ready).toBe(false);
      expect(result.storage.ready).toBe(false);
      expect(result.storage.error).toBe('ECONNREFUSED');
    });
  });

  describe('extractionEvents (SSE)', () => {
    it('wraps each progress event as a typed extraction-progress MessageEvent', async () => {
      const upcoming = firstValueFrom(
        controller.extractionEvents().pipe(take(2), toArray()),
      );

      progressSubject.next({
        jobId: 'j1',
        phase: 'started',
        at: 1,
      });
      progressSubject.next({
        jobId: 'j1',
        phase: 'frames',
        framesProcessed: 30,
        totalFrames: 60,
        at: 2,
      });

      const events = await upcoming;
      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({
        type: 'extraction-progress',
        data: { jobId: 'j1', phase: 'started', at: 1 },
      });
      expect(events[1]).toEqual({
        type: 'extraction-progress',
        data: {
          jobId: 'j1',
          phase: 'frames',
          framesProcessed: 30,
          totalFrames: 60,
          at: 2,
        },
      });
    });
  });
});
