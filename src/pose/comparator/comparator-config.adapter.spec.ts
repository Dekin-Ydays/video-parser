import {
  adaptComparatorConfig,
  validateComparatorConfig,
} from './comparator-config.adapter';

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

  it('rejects invalid landmark weight entries instead of filtering them', () => {
    const config = adaptComparatorConfig({
      landmarkWeights: new Map<unknown, unknown>([
        [11, 2],
        ['bad', 1],
        [12, 'bad'],
      ]),
    });

    expect(config).toBeUndefined();
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

  it('rejects invalid fields and returns undefined', () => {
    const config = adaptComparatorConfig({
      normalization: { center: 'yes' },
      positionWeight: 'high',
      angularWeight: null,
      visibilityThreshold: NaN,
      landmarkWeights: { bad: 'value' },
    });

    expect(config).toBeUndefined();
  });

  it('rejects unsupported fields and out-of-range values', () => {
    expect(validateComparatorConfig({ preset: 'dance' }).ok).toBe(false);
    expect(validateComparatorConfig({ positionWeight: 1.2 }).ok).toBe(false);
    expect(validateComparatorConfig({ angularWeight: -0.1 }).ok).toBe(false);
    expect(validateComparatorConfig({ visibilityThreshold: 2 }).ok).toBe(false);
    expect(validateComparatorConfig({ landmarkWeights: { '99': 1 } }).ok).toBe(
      false,
    );
  });

  it('accepts frontend comparison presets', () => {
    const presets = [
      {
        normalization: {
          center: true,
          scale: true,
          rotation: false,
        },
        positionWeight: 0.5,
        angularWeight: 0.5,
      },
      {
        normalization: {
          center: true,
          scale: true,
          rotation: true,
        },
        positionWeight: 0.4,
        angularWeight: 0.6,
      },
      {
        normalization: {
          center: true,
          scale: true,
          rotation: false,
        },
        positionWeight: 0.7,
        angularWeight: 0.3,
        visibilityThreshold: 0.7,
      },
    ];

    for (const preset of presets) {
      expect(validateComparatorConfig(preset).ok).toBe(true);
    }
  });
});
