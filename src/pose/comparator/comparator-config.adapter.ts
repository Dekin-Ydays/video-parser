import {
  ComparatorConfig,
  NormalizationOptions,
} from '../types/pose-comparison.types';

type ConfigObject = Record<string, unknown>;

function isObject(value: unknown): value is ConfigObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseNormalization(
  value: unknown,
): Partial<NormalizationOptions> | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const normalization: Partial<NormalizationOptions> = {};

  if (typeof value.center === 'boolean') {
    normalization.center = value.center;
  }
  if (typeof value.scale === 'boolean') {
    normalization.scale = value.scale;
  }
  if (typeof value.rotation === 'boolean') {
    normalization.rotation = value.rotation;
  }

  return Object.keys(normalization).length > 0 ? normalization : undefined;
}

function parseLandmarkWeights(value: unknown): Map<number, number> | undefined {
  const result = new Map<number, number>();

  if (value instanceof Map) {
    for (const [rawKey, rawWeight] of value.entries()) {
      const key = typeof rawKey === 'number' ? rawKey : Number(rawKey);
      const weight = toFiniteNumber(rawWeight);
      if (Number.isFinite(key) && weight !== undefined) {
        result.set(key, weight);
      }
    }
    return result.size > 0 ? result : undefined;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!Array.isArray(entry) || entry.length !== 2) {
        continue;
      }

      const key = typeof entry[0] === 'number' ? entry[0] : Number(entry[0]);
      const weight = toFiniteNumber(entry[1]);
      if (Number.isFinite(key) && weight !== undefined) {
        result.set(key, weight);
      }
    }
    return result.size > 0 ? result : undefined;
  }

  if (isObject(value)) {
    for (const [rawKey, rawWeight] of Object.entries(value)) {
      const key = Number(rawKey);
      const weight = toFiniteNumber(rawWeight);
      if (Number.isFinite(key) && weight !== undefined) {
        result.set(key, weight);
      }
    }
    return result.size > 0 ? result : undefined;
  }

  return undefined;
}

export function adaptComparatorConfig(input: unknown): ComparatorConfig | undefined {
  if (!isObject(input)) {
    return undefined;
  }

  const config: ComparatorConfig = {};
  const normalization = parseNormalization(input.normalization);
  if (normalization) {
    config.normalization = normalization;
  }

  const landmarkWeights = parseLandmarkWeights(input.landmarkWeights);
  if (landmarkWeights) {
    config.landmarkWeights = landmarkWeights;
  }

  const positionWeight = toFiniteNumber(input.positionWeight);
  if (positionWeight !== undefined) {
    config.positionWeight = positionWeight;
  }

  const angularWeight = toFiniteNumber(input.angularWeight);
  if (angularWeight !== undefined) {
    config.angularWeight = angularWeight;
  }

  const visibilityThreshold = toFiniteNumber(input.visibilityThreshold);
  if (visibilityThreshold !== undefined) {
    config.visibilityThreshold = visibilityThreshold;
  }

  return Object.keys(config).length > 0 ? config : undefined;
}
