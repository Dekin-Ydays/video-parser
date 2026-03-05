import { Writer } from 'protobufjs/minimal';
import { decodePoseFrameProtobufBinary } from './pose.protobuf';

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

  return writer.finish();
}

describe('decodePoseFrameProtobufBinary', () => {
  it('decodes a protobuf PoseFrame packet with landmarks', () => {
    const decoded = decodePoseFrameProtobufBinary(
      encodePoseFrameWithLandmark(),
    );

    expect(decoded).toEqual({
      timestamp: 1730000000000,
      type: 'pose-landmarks',
      landmarks: [
        {
          x: expect.any(Number),
          y: expect.any(Number),
          z: expect.any(Number),
          visibility: expect.any(Number),
        },
      ],
    });
  });

  it('returns null for malformed protobuf payload', () => {
    const decoded = decodePoseFrameProtobufBinary(Buffer.from([0xff]));
    expect(decoded).toBeNull();
  });

  it('returns null when protobuf packet has no landmarks', () => {
    const payload = Writer.create().uint32(8).int64(1730000000000).finish();
    const decoded = decodePoseFrameProtobufBinary(payload);

    expect(decoded).toBeNull();
  });
});
