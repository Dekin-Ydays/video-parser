import { Test, TestingModule } from '@nestjs/testing';
import { PoseService } from './pose.service';
import { PrismaService } from '../prisma.service';

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
  });
});
