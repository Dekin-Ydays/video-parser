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
});
