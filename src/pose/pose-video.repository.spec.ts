import { PoseVideoRepository } from './pose-video.repository';

function makeRepository(prisma: Record<string, unknown>) {
  return new PoseVideoRepository(
    prisma as never,
    { uploadVideo: jest.fn() } as never,
  );
}

describe('PoseVideoRepository', () => {
  describe('getVideoById', () => {
    it('returns null when the video does not exist', async () => {
      const prisma = {
        video: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      };
      const repository = makeRepository(prisma);

      await expect(repository.getVideoById('missing')).resolves.toBeNull();
    });

    it('maps stored frame JSON to scoring video frames', async () => {
      const prisma = {
        video: {
          findUnique: jest.fn().mockResolvedValue({
            frames: [
              { data: { timestamp: 1, landmarks: [{ x: 1, y: 2, z: 3 }] } },
              { data: { timestamp: 2, landmarks: [{ x: 4, y: 5, z: 6 }] } },
            ],
          }),
        },
      };
      const repository = makeRepository(prisma);

      const video = await repository.getVideoById('v1');

      expect(prisma.video.findUnique).toHaveBeenCalledWith({
        where: { id: 'v1' },
        include: {
          frames: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: { data: true },
          },
        },
      });
      expect(video).toEqual({
        frames: [
          {
            timestamp: 1,
            landmarks: [{ x: 1, y: 2, z: 3, visibility: undefined }],
          },
          {
            timestamp: 2,
            landmarks: [{ x: 4, y: 5, z: 6, visibility: undefined }],
          },
        ],
      });
    });

    it('drops invalid landmarks instead of coercing values to zero', async () => {
      const prisma = {
        video: {
          findUnique: jest.fn().mockResolvedValue({
            frames: [
              {
                data: {
                  timestamp: 1,
                  landmarks: [
                    { x: 1, y: 2, z: 3 },
                    { x: 'bad', y: 1, z: 1 },
                    { x: 2, y: 3, z: 4, visibility: 0.9 },
                  ],
                },
              },
            ],
          }),
        },
      };
      const repository = makeRepository(prisma);

      const video = await repository.getVideoById('v1');

      expect(video).toEqual({
        frames: [
          {
            timestamp: 1,
            landmarks: [
              { x: 1, y: 2, z: 3, visibility: undefined },
              { x: 2, y: 3, z: 4, visibility: 0.9 },
            ],
          },
        ],
      });
    });

    it('drops frames with invalid timestamp or no valid landmarks', async () => {
      const prisma = {
        video: {
          findUnique: jest.fn().mockResolvedValue({
            frames: [
              {
                data: {
                  timestamp: 'bad',
                  landmarks: [{ x: 1, y: 2, z: 3 }],
                },
              },
              {
                data: {
                  timestamp: 2,
                  landmarks: [{ x: 'bad', y: 2 }],
                },
              },
            ],
          }),
        },
      };
      const repository = makeRepository(prisma);

      const video = await repository.getVideoById('v1');

      expect(video).toEqual({ frames: [] });
    });
  });
});
