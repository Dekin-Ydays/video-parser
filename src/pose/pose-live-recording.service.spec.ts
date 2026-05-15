import { Test, TestingModule } from '@nestjs/testing';
import { FrameBufferService } from './frame.buffer';
import { PoseLiveRecordingService } from './pose-live-recording.service';
import { PoseRecordingSessionService } from './pose-recording-session.service';

describe('PoseLiveRecordingService', () => {
  let service: PoseLiveRecordingService;

  const mockSessionService = {
    startVideo: jest.fn(),
    removeClient: jest.fn(),
  };

  const mockFrameBufferService = {
    appendPayload: jest.fn(),
    disconnectClient: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PoseLiveRecordingService,
        {
          provide: PoseRecordingSessionService,
          useValue: mockSessionService,
        },
        {
          provide: FrameBufferService,
          useValue: mockFrameBufferService,
        },
      ],
    }).compile();

    service = module.get(PoseLiveRecordingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('starts the recording session on connect', async () => {
    mockSessionService.startVideo.mockResolvedValue(undefined);

    await service.connectClient('client-a');

    expect(mockSessionService.startVideo).toHaveBeenCalledWith('client-a');
  });

  it('appends decoded payloads through the frame buffer', () => {
    const payload = { landmarks: [{ x: 1, y: 2, z: 3 }] };
    mockFrameBufferService.appendPayload.mockReturnValue(true);

    expect(service.appendPayload('client-a', payload)).toBe(true);
    expect(mockFrameBufferService.appendPayload).toHaveBeenCalledWith(
      'client-a',
      payload,
    );
  });

  it('flushes buffered frames before removing the session on disconnect', async () => {
    mockFrameBufferService.disconnectClient.mockResolvedValue(undefined);
    mockSessionService.removeClient.mockResolvedValue(undefined);

    await service.disconnectClient('client-a');

    expect(mockFrameBufferService.disconnectClient).toHaveBeenCalledWith(
      'client-a',
    );
    expect(mockSessionService.removeClient).toHaveBeenCalledWith('client-a');
    expect(
      mockFrameBufferService.disconnectClient.mock.invocationCallOrder[0],
    ).toBeLessThan(mockSessionService.removeClient.mock.invocationCallOrder[0]);
  });
});
