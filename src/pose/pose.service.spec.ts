import { Test, TestingModule } from '@nestjs/testing';
import { PoseService } from './pose.service';
import { PoseRecordingSessionService } from './pose-recording-session.service';
import { PoseVideoRepository } from './pose-video.repository';
import { PoseFrame } from './types/pose.types';

describe('PoseService', () => {
  let service: PoseService;

  const mockSessionService = {
    startVideo: jest.fn(),
    upsertLatest: jest.fn(),
    removeClient: jest.fn(),
    listClients: jest.fn(),
    getLatest: jest.fn(),
  };

  const mockVideoRepository = {
    listVideos: jest.fn(),
    getVideoById: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PoseService,
        {
          provide: PoseRecordingSessionService,
          useValue: mockSessionService,
        },
        {
          provide: PoseVideoRepository,
          useValue: mockVideoRepository,
        },
      ],
    }).compile();

    service = module.get<PoseService>(PoseService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('session delegation', () => {
    it('delegates start/upsert/remove to session service', async () => {
      const frame: PoseFrame = {
        timestamp: 1,
        landmarks: [{ x: 0.1, y: 0.2, z: 0.3 }],
      };

      await service.startVideo('c1');
      await service.upsertLatest('c1', frame);
      await service.removeClient('c1');

      expect(mockSessionService.startVideo).toHaveBeenCalledWith('c1');
      expect(mockSessionService.upsertLatest).toHaveBeenCalledWith('c1', frame);
      expect(mockSessionService.removeClient).toHaveBeenCalledWith('c1');
    });

    it('delegates listClients/getLatest to session service', () => {
      const expectedClients = [{ clientId: 'c1', lastSeenAt: 123 }];
      const expectedFrame: PoseFrame = {
        timestamp: 123,
        landmarks: [{ x: 0.1, y: 0.2 }],
      };

      mockSessionService.listClients.mockReturnValue(expectedClients);
      mockSessionService.getLatest.mockReturnValue(expectedFrame);

      expect(service.listClients()).toEqual(expectedClients);
      expect(service.getLatest('c1')).toEqual(expectedFrame);
      expect(mockSessionService.getLatest).toHaveBeenCalledWith('c1');
    });
  });

  describe('video queries', () => {
    it('returns empty array if listVideos fails', async () => {
      mockVideoRepository.listVideos.mockRejectedValue(new Error('db down'));

      const videos = await service.listVideos();

      expect(videos).toEqual([]);
    });

    it('maps stored video data to comparator format', async () => {
      mockVideoRepository.getVideoById.mockResolvedValue({
        frames: [
          { data: { timestamp: 1, landmarks: [{ x: 1, y: 2, z: 3 }] } },
          { data: { timestamp: 2, landmarks: [{ x: 4, y: 5, z: 6 }] } },
        ],
      });

      const video = await service.getVideoById('v1');

      expect(video).toEqual({
        frames: [
          { timestamp: 1, landmarks: [{ x: 1, y: 2, z: 3, visibility: undefined }] },
          { timestamp: 2, landmarks: [{ x: 4, y: 5, z: 6, visibility: undefined }] },
        ],
      });
    });
  });

  describe('compareVideos', () => {
    it('accepts JSON-safe comparator config with object landmarkWeights', async () => {
      const videoA = {
        frames: [
          {
            data: {
              timestamp: 1,
              landmarks: Array.from({ length: 33 }, (_, index) => ({
                x: index * 0.1,
                y: index * 0.1,
                z: index * 0.1,
                visibility: 1,
              })),
            },
          },
        ],
      };

      const videoB = {
        frames: [
          {
            data: {
              timestamp: 1,
              landmarks: Array.from({ length: 33 }, (_, index) => ({
                x: index * 0.1,
                y: index * 0.1,
                z: index * 0.1,
                visibility: 1,
              })),
            },
          },
        ],
      };

      mockVideoRepository.getVideoById
        .mockResolvedValueOnce(videoA)
        .mockResolvedValueOnce(videoB);

      const result = await service.compareVideos('video-a', 'video-b', {
        landmarkWeights: {
          '11': 2,
          '12': 2,
        },
        positionWeight: 0.7,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.result.overallScore).toBeGreaterThan(0);
      }
    });

    it('returns not_found when one or both videos are missing', async () => {
      mockVideoRepository.getVideoById
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          frames: [],
        });

      const result = await service.compareVideos('video-a', 'video-b');

      expect(result).toEqual({
        ok: false,
        error: 'not_found',
        message: 'One or both videos were not found',
      });
    });

    it('returns invalid_config when config cannot be adapted', async () => {
      const video = {
        frames: [
          {
            data: {
              timestamp: 1,
              landmarks: Array.from({ length: 33 }, (_, index) => ({
                x: index * 0.1,
                y: index * 0.1,
                z: index * 0.1,
                visibility: 1,
              })),
            },
          },
        ],
      };

      mockVideoRepository.getVideoById
        .mockResolvedValueOnce(video)
        .mockResolvedValueOnce(video);

      const result = await service.compareVideos('video-a', 'video-b', {
        positionWeight: 'bad',
      });

      expect(result).toEqual({
        ok: false,
        error: 'invalid_config',
        message: 'Invalid comparator configuration',
      });
    });

    it('returns internal_error when compare process throws unexpectedly', async () => {
      jest
        .spyOn(service, 'getVideoById')
        .mockRejectedValueOnce(new Error('unexpected'));

      const result = await service.compareVideos('video-a', 'video-b');

      expect(result).toEqual({
        ok: false,
        error: 'internal_error',
        message: 'Failed to compare videos due to an internal error',
      });
    });
  });
});
