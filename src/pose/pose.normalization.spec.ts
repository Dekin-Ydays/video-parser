import { normalizeFrame } from './pose.normalization';

describe('normalizeFrame', () => {
  it('accepts array payload', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(123);
    try {
      expect(normalizeFrame([{ x: 1, y: 2 }])).toEqual({
        timestamp: 123,
        landmarks: [{ x: 1, y: 2 }],
        rawType: undefined,
      });
    } finally {
      now.mockRestore();
    }
  });

  it('accepts object payload with landmarks', () => {
    expect(
      normalizeFrame({ timestamp: 1, landmarks: [{ x: 1, y: 2 }] }),
    ).toEqual({
      timestamp: 1,
      landmarks: [{ x: 1, y: 2 }],
      rawType: undefined,
    });
  });

  it('accepts object payload with poseLandmarks', () => {
    expect(
      normalizeFrame({ timestamp: 1, poseLandmarks: [{ x: 1, y: 2 }] }),
    ).toEqual({
      timestamp: 1,
      landmarks: [{ x: 1, y: 2 }],
      rawType: undefined,
    });
  });

  it('accepts object payload with points', () => {
    expect(normalizeFrame({ timestamp: 1, points: [{ x: 1, y: 2 }] })).toEqual({
      timestamp: 1,
      landmarks: [{ x: 1, y: 2 }],
      rawType: undefined,
    });
  });

  it('accepts new {type, data:[[...]]} payload', () => {
    expect(
      normalizeFrame({
        type: 'pose-landmarks',
        timestamp: 1,
        data: [[{ x: 1, y: 2 }]],
      }),
    ).toEqual({
      timestamp: 1,
      landmarks: [{ x: 1, y: 2 }],
      rawType: 'pose-landmarks',
    });
  });

  it('accepts nested array payload ([[landmarks]])', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(123);
    try {
      expect(normalizeFrame([[{ x: 1, y: 2 }]])).toEqual({
        timestamp: 123,
        landmarks: [{ x: 1, y: 2 }],
        rawType: undefined,
      });
    } finally {
      now.mockRestore();
    }
  });

  it('rejects payloads without any landmarks', () => {
    expect(normalizeFrame({ data: [[]] })).toBeNull();
    expect(normalizeFrame({ data: [] })).toBeNull();
    expect(normalizeFrame([])).toBeNull();
  });
});
