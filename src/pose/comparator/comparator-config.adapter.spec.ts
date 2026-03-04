import { adaptComparatorConfig } from './comparator-config.adapter';

describe('adaptComparatorConfig', () => {
  it('returns undefined for non-object input', () => {
    expect(adaptComparatorConfig(undefined)).toBeUndefined();
    expect(adaptComparatorConfig(null)).toBeUndefined();
    expect(adaptComparatorConfig('bad')).toBeUndefined();
    expect(adaptComparatorConfig(123)).toBeUndefined();
  });

  it('adapts plain-object landmark weights into a Map', () => {
    const config = adaptComparatorConfig({
      landmarkWeights: {
        '11': 2,
        '12': 1.5,
      },
    });

    expect(config?.landmarkWeights).toBeInstanceOf(Map);
    expect(config?.landmarkWeights?.get(11)).toBe(2);
    expect(config?.landmarkWeights?.get(12)).toBe(1.5);
  });

  it('adapts array landmark weights into a Map', () => {
    const config = adaptComparatorConfig({
      landmarkWeights: [
        [11, 2],
        ['12', 1.5],
      ],
    });

    expect(config?.landmarkWeights).toBeInstanceOf(Map);
    expect(config?.landmarkWeights?.get(11)).toBe(2);
    expect(config?.landmarkWeights?.get(12)).toBe(1.5);
  });

  it('keeps map landmark weights and filters invalid entries', () => {
    const config = adaptComparatorConfig({
      landmarkWeights: new Map<unknown, unknown>([
        [11, 2],
        ['bad', 1],
        [12, 'bad'],
      ]),
    });

    expect(config?.landmarkWeights).toBeInstanceOf(Map);
    expect(config?.landmarkWeights?.size).toBe(1);
    expect(config?.landmarkWeights?.get(11)).toBe(2);
  });

  it('adapts supported numeric and normalization options', () => {
    const config = adaptComparatorConfig({
      normalization: {
        center: true,
        scale: false,
        rotation: true,
      },
      positionWeight: 0.7,
      angularWeight: 0.3,
      visibilityThreshold: 0.6,
    });

    expect(config?.normalization).toEqual({
      center: true,
      scale: false,
      rotation: true,
    });
    expect(config?.positionWeight).toBe(0.7);
    expect(config?.angularWeight).toBe(0.3);
    expect(config?.visibilityThreshold).toBe(0.6);
  });

  it('ignores invalid fields and returns undefined when nothing is usable', () => {
    const config = adaptComparatorConfig({
      normalization: { center: 'yes' },
      positionWeight: 'high',
      angularWeight: null,
      visibilityThreshold: NaN,
      landmarkWeights: { bad: 'value' },
    });

    expect(config).toBeUndefined();
  });
});
