import { parsePoseFrame, parseScoringFrame } from './pose-frame.parser';

describe('pose-frame parser', () => {
  it('normalizes accepted landmark containers into scoreable frames', () => {
    expect(
      parsePoseFrame(
        {
          timestamp: 10,
          data: [[{ x: 1, y: 2, visibility: 0.8 }]],
          type: 'pose-landmarks',
        },
        { defaultTimestamp: () => 0 },
      ),
    ).toEqual({
      timestamp: 10,
      landmarks: [{ x: 1, y: 2, z: 0, visibility: 0.8 }],
      rawType: 'pose-landmarks',
    });
  });

  it('requires finite timestamps when no default is supplied', () => {
    expect(parsePoseFrame({ landmarks: [{ x: 1, y: 2, z: 3 }] })).toBeNull();
  });

  it('drops invalid landmarks but keeps valid scoreable ones', () => {
    expect(
      parseScoringFrame({
        timestamp: 1,
        landmarks: [
          { x: 1, y: 2 },
          { x: 'bad', y: 2, z: 3 },
          { x: 4, y: 5, z: 6 },
        ],
      }),
    ).toEqual({
      timestamp: 1,
      landmarks: [
        { x: 1, y: 2, z: 0, visibility: undefined },
        { x: 4, y: 5, z: 6, visibility: undefined },
      ],
    });
  });

  it('rejects frames with no scoreable landmarks', () => {
    expect(
      parseScoringFrame({
        timestamp: 1,
        landmarks: [{ x: 'bad', y: 2, z: 3 }],
      }),
    ).toBeNull();
  });
});
