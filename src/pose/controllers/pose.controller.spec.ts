import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PoseController } from './pose.controller';
import { PoseService } from '../pose.service';

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PoseController],
      providers: [
        {
          provide: PoseService,
          useValue: mockPoseService,
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
});
