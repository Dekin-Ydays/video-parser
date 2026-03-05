import { Test, TestingModule } from '@nestjs/testing';
import { FrameBufferService } from './frame.buffer';
import { PoseService } from './pose.service';

describe('FrameBufferService', () => {
  let moduleRef: TestingModule;
  let service: FrameBufferService;

  const mockPoseService = {
    upsertLatest: jest.fn().mockResolvedValue(undefined),
  };

  function payload(timestamp: number) {
    return {
      timestamp,
      landmarks: [{ x: 0.1, y: 0.2, z: -0.3, visibility: 0.9 }],
    };
  }

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        FrameBufferService,
        {
          provide: PoseService,
          useValue: mockPoseService,
        },
      ],
    }).compile();

    service = moduleRef.get(FrameBufferService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await moduleRef.close();
  });

  it('returns false for invalid payload and does not enqueue writes', async () => {
    const accepted = service.appendPayload('client-a', { foo: 'bar' });

    expect(accepted).toBe(false);
    await service.disconnectClient('client-a');
    expect(mockPoseService.upsertLatest).not.toHaveBeenCalled();
  });

  it('keeps frames isolated per client', async () => {
    service.appendPayload('client-a', payload(1));
    for (let i = 0; i < 20; i += 1) {
      service.appendPayload('client-b', payload(100 + i));
    }

    await service.flushClient('client-b');
    expect(mockPoseService.upsertLatest).toHaveBeenCalledTimes(20);
    expect(mockPoseService.upsertLatest).not.toHaveBeenCalledWith(
      'client-a',
      expect.anything(),
    );

    await service.disconnectClient('client-a');
    expect(mockPoseService.upsertLatest).toHaveBeenCalledTimes(21);
    expect(mockPoseService.upsertLatest).toHaveBeenCalledWith(
      'client-a',
      expect.objectContaining({ timestamp: 1 }),
    );
  });

  it('flushes pending frames for a client on disconnect', async () => {
    service.appendPayload('client-a', payload(1));
    service.appendPayload('client-a', payload(2));

    await service.disconnectClient('client-a');

    expect(mockPoseService.upsertLatest).toHaveBeenCalledTimes(2);
    expect(mockPoseService.upsertLatest).toHaveBeenNthCalledWith(
      1,
      'client-a',
      expect.objectContaining({ timestamp: 1 }),
    );
    expect(mockPoseService.upsertLatest).toHaveBeenNthCalledWith(
      2,
      'client-a',
      expect.objectContaining({ timestamp: 2 }),
    );
  });

  it('ignores new frames after disconnect starts for a client', async () => {
    service.appendPayload('client-a', payload(1));

    const disconnectPromise = service.disconnectClient('client-a');
    service.appendPayload('client-a', payload(2));
    await disconnectPromise;

    expect(mockPoseService.upsertLatest).toHaveBeenCalledTimes(1);
    expect(mockPoseService.upsertLatest).toHaveBeenCalledWith(
      'client-a',
      expect.objectContaining({ timestamp: 1 }),
    );
  });
});
