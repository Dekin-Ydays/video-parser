import { Test, TestingModule } from '@nestjs/testing';
import { PoseService } from './pose.service';
import { PrismaService } from '../prisma.service';
import { PoseFrame } from './types/pose.types';

describe('PoseService', () => {
  let service: PoseService;
  let prisma: PrismaService;

  const mockPrismaService = {
    video: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    frame: {
      create: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PoseService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<PoseService>(PoseService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('removeClient', () => {
    it('should buffer frames until startVideo completes', async () => {
      const clientId = 'client-buffer';
      const videoId = 'video-buffer';
      const frame: PoseFrame = {
        timestamp: 1,
        landmarks: [{ x: 0.1, y: 0.2, z: 0.3 }],
      };

      let resolveVideoCreate: ((value: { id: string }) => void) | undefined;
      mockPrismaService.video.create.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveVideoCreate = resolve;
          }),
      );
      mockPrismaService.frame.create.mockResolvedValue({});

      const startPromise = service.startVideo(clientId);
      await service.upsertLatest(clientId, frame);

      expect(mockPrismaService.frame.create).not.toHaveBeenCalled();

      resolveVideoCreate?.({ id: videoId });
      await startPromise;
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockPrismaService.frame.create).toHaveBeenCalledWith({
        data: {
          videoId,
          data: frame,
        },
      });
    });

    it('should delete video if frame count is 0', async () => {
      const clientId = 'client1';
      const videoId = 'video1';

      // Simulate startVideo
      mockPrismaService.video.create.mockResolvedValue({ id: videoId });
      await service.startVideo(clientId);

      // Mock frame count to be 0
      mockPrismaService.frame.count.mockResolvedValue(0);
      mockPrismaService.video.delete.mockResolvedValue({});

      await service.removeClient(clientId);

      expect(mockPrismaService.frame.count).toHaveBeenCalledWith({
        where: { videoId },
      });
      expect(mockPrismaService.video.delete).toHaveBeenCalledWith({
        where: { id: videoId },
      });
      expect(mockPrismaService.video.update).not.toHaveBeenCalled();
    });

    it('should update endTime if frame count is > 0', async () => {
      const clientId = 'client2';
      const videoId = 'video2';

      // Simulate startVideo
      mockPrismaService.video.create.mockResolvedValue({ id: videoId });
      await service.startVideo(clientId);

      // Mock frame count to be 5
      mockPrismaService.frame.count.mockResolvedValue(5);
      mockPrismaService.video.update.mockResolvedValue({});

      await service.removeClient(clientId);

      expect(mockPrismaService.frame.count).toHaveBeenCalledWith({
        where: { videoId },
      });
      expect(mockPrismaService.video.delete).not.toHaveBeenCalled();
      expect(mockPrismaService.video.update).toHaveBeenCalledWith({
        where: { id: videoId },
        data: { endTime: expect.any(Date) },
      });
    });

    it('should flush pending frame writes before counting frames', async () => {
      const clientId = 'client-flush';
      const videoId = 'video-flush';
      const frame: PoseFrame = {
        timestamp: 1,
        landmarks: [{ x: 0.1, y: 0.2, z: 0.3 }],
      };

      let resolveFrameCreate: (() => void) | undefined;

      mockPrismaService.video.create.mockResolvedValue({ id: videoId });
      mockPrismaService.frame.create.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFrameCreate = () => resolve({});
          }),
      );
      mockPrismaService.frame.count.mockResolvedValue(1);
      mockPrismaService.video.update.mockResolvedValue({});

      await service.startVideo(clientId);
      await service.upsertLatest(clientId, frame);

      const removePromise = service.removeClient(clientId);
      await Promise.resolve();

      expect(mockPrismaService.frame.count).not.toHaveBeenCalled();

      resolveFrameCreate?.();
      await removePromise;

      expect(mockPrismaService.frame.count).toHaveBeenCalledWith({
        where: { videoId },
      });
    });
  });

  describe('compareVideos', () => {
    it('should accept JSON-safe comparator config with object landmarkWeights', async () => {
      const videoIdA = 'video-a';
      const videoIdB = 'video-b';

      const createFrameData = () => ({
        timestamp: 1,
        landmarks: Array.from({ length: 33 }, (_, index) => ({
          x: index * 0.1,
          y: index * 0.1,
          z: index * 0.1,
          visibility: 1,
        })),
      });

      const frameDataA = createFrameData();
      const frameDataB = createFrameData();

      mockPrismaService.video.findUnique
        .mockResolvedValueOnce({
          id: videoIdA,
          frames: [{ data: frameDataA }],
        })
        .mockResolvedValueOnce({
          id: videoIdB,
          frames: [{ data: frameDataB }],
        });

      const result = await service.compareVideos(videoIdA, videoIdB, {
        landmarkWeights: {
          '11': 2,
          '12': 2,
        },
        positionWeight: 0.7,
      });

      expect(result).not.toBeNull();
      expect(result?.overallScore).toBeGreaterThan(0);
    });
  });
});
