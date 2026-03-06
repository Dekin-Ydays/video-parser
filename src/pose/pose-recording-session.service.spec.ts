import { Test, TestingModule } from '@nestjs/testing';
import { PoseRecordingSessionService } from './pose-recording-session.service';
import { PoseVideoRepository } from './pose-video.repository';
import { PoseFrame } from './types/pose.types';

describe('PoseRecordingSessionService', () => {
  let service: PoseRecordingSessionService;

  const mockVideoRepository = {
    createVideo: jest.fn(),
    createFrame: jest.fn(),
    countFrames: jest.fn(),
    deleteVideo: jest.fn(),
    endVideo: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PoseRecordingSessionService,
        {
          provide: PoseVideoRepository,
          useValue: mockVideoRepository,
        },
      ],
    }).compile();

    service = module.get<PoseRecordingSessionService>(
      PoseRecordingSessionService,
    );
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

      let resolveVideoCreate: ((videoId: string) => void) | undefined;
      mockVideoRepository.createVideo.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveVideoCreate = resolve;
          }),
      );
      mockVideoRepository.createFrame.mockResolvedValue(undefined);

      const startPromise = service.startVideo(clientId);
      await service.upsertLatest(clientId, frame);

      expect(mockVideoRepository.createFrame).not.toHaveBeenCalled();

      resolveVideoCreate?.(videoId);
      await startPromise;
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockVideoRepository.createFrame).toHaveBeenCalledWith(
        videoId,
        frame,
      );
    });

    it('should delete video if frame count is 0', async () => {
      const clientId = 'client1';
      const videoId = 'video1';

      mockVideoRepository.createVideo.mockResolvedValue(videoId);
      await service.startVideo(clientId);

      mockVideoRepository.countFrames.mockResolvedValue(0);
      mockVideoRepository.deleteVideo.mockResolvedValue(undefined);

      await service.removeClient(clientId);

      expect(mockVideoRepository.countFrames).toHaveBeenCalledWith(videoId);
      expect(mockVideoRepository.deleteVideo).toHaveBeenCalledWith(videoId);
      expect(mockVideoRepository.endVideo).not.toHaveBeenCalled();
    });

    it('should end video if frame count is > 0', async () => {
      const clientId = 'client2';
      const videoId = 'video2';

      mockVideoRepository.createVideo.mockResolvedValue(videoId);
      await service.startVideo(clientId);

      mockVideoRepository.countFrames.mockResolvedValue(5);
      mockVideoRepository.endVideo.mockResolvedValue(undefined);

      await service.removeClient(clientId);

      expect(mockVideoRepository.countFrames).toHaveBeenCalledWith(videoId);
      expect(mockVideoRepository.deleteVideo).not.toHaveBeenCalled();
      expect(mockVideoRepository.endVideo).toHaveBeenCalledWith(
        videoId,
        expect.any(Date),
      );
    });

    it('should flush pending frame writes before counting frames', async () => {
      const clientId = 'client-flush';
      const videoId = 'video-flush';
      const frame: PoseFrame = {
        timestamp: 1,
        landmarks: [{ x: 0.1, y: 0.2, z: 0.3 }],
      };

      let resolveFrameCreate: (() => void) | undefined;

      mockVideoRepository.createVideo.mockResolvedValue(videoId);
      mockVideoRepository.createFrame.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFrameCreate = () => resolve(undefined);
          }),
      );
      mockVideoRepository.countFrames.mockResolvedValue(1);
      mockVideoRepository.endVideo.mockResolvedValue(undefined);

      await service.startVideo(clientId);
      await service.upsertLatest(clientId, frame);

      const removePromise = service.removeClient(clientId);
      await Promise.resolve();

      expect(mockVideoRepository.countFrames).not.toHaveBeenCalled();

      resolveFrameCreate?.();
      await removePromise;

      expect(mockVideoRepository.countFrames).toHaveBeenCalledWith(videoId);
    });

    it('should ignore upserts after removeClient starts', async () => {
      const clientId = 'client-closing';
      const videoId = 'video-closing';
      const frame1: PoseFrame = {
        timestamp: 1,
        landmarks: [{ x: 0.1, y: 0.2, z: 0.3 }],
      };
      const frame2: PoseFrame = {
        timestamp: 2,
        landmarks: [{ x: 0.4, y: 0.5, z: 0.6 }],
      };

      let resolveFrameCreate: (() => void) | undefined;
      mockVideoRepository.createVideo.mockResolvedValue(videoId);
      mockVideoRepository.createFrame.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFrameCreate = () => resolve(undefined);
          }),
      );
      mockVideoRepository.countFrames.mockResolvedValue(1);
      mockVideoRepository.endVideo.mockResolvedValue(undefined);

      await service.startVideo(clientId);
      await service.upsertLatest(clientId, frame1);

      const removePromise = service.removeClient(clientId);
      await Promise.resolve();
      await service.upsertLatest(clientId, frame2);

      resolveFrameCreate?.();
      await removePromise;

      expect(mockVideoRepository.createFrame).toHaveBeenCalledTimes(1);
      expect(mockVideoRepository.createFrame).toHaveBeenCalledWith(
        videoId,
        frame1,
      );
    });
  });
});
