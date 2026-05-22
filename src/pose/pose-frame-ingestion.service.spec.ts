import { Writer } from 'protobufjs/minimal';
import { PoseFrameIngestionService } from './pose-frame-ingestion.service';

function encodePoseFrameWithLandmark() {
  const writer = Writer.create();

  writer.uint32(8).int64(1730000000000);
  writer.uint32(18).string('pose-landmarks');
  writer
    .uint32(26)
    .fork()
    .uint32(13)
    .float(0.1)
    .uint32(21)
    .float(0.2)
    .uint32(29)
    .float(-0.3)
    .uint32(37)
    .float(0.99)
    .ldelim();

  return Buffer.from(writer.finish());
}

describe('PoseFrameIngestionService', () => {
  let service: PoseFrameIngestionService;

  beforeEach(() => {
    service = new PoseFrameIngestionService();
  });

  it('accepts protobuf PoseFrame payloads', () => {
    const result = service.ingest(encodePoseFrameWithLandmark());

    expect(result).toEqual({
      ok: true,
      frame: {
        timestamp: 1730000000000,
        rawType: 'pose-landmarks',
        landmarks: [
          {
            x: expect.any(Number),
            y: expect.any(Number),
            z: expect.any(Number),
            visibility: expect.any(Number),
          },
        ],
      },
    });
  });

  it('accepts JSON payloads and supplies a timestamp when omitted', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(123);
    try {
      const result = service.ingest(
        JSON.stringify({ landmarks: [{ x: 1, y: 2 }] }),
      );

      expect(result).toEqual({
        ok: true,
        frame: {
          timestamp: 123,
          rawType: undefined,
          landmarks: [{ x: 1, y: 2, z: 0 }],
        },
      });
    } finally {
      now.mockRestore();
    }
  });

  it('accepts binary JSON fallback payloads', () => {
    const result = service.ingest(
      Buffer.from(
        JSON.stringify({
          timestamp: 1,
          poseLandmarks: [{ x: 1, y: 2 }],
        }),
      ),
    );

    expect(result).toEqual({
      ok: true,
      frame: {
        timestamp: 1,
        rawType: undefined,
        landmarks: [{ x: 1, y: 2, z: 0 }],
      },
    });
  });

  it('rejects malformed JSON strings', () => {
    expect(service.ingest('{bad json')).toEqual({
      ok: false,
      message: 'Invalid JSON',
    });
  });

  it('rejects decoded payloads without landmarks', () => {
    expect(service.ingest(JSON.stringify({ timestamp: 1, data: [] }))).toEqual({
      ok: false,
      message:
        'Invalid payload; expected protobuf PoseFrame landmarks (or JSON landmarks/poseLandmarks/points/data)',
    });
  });
});
