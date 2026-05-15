import {
  ComparatorConfig,
  NormalizationOptions,
} from '../types/pose-comparison.types';
import { isRecord, toFiniteNumber, UnknownRecord } from '../../utils';

type ConfigObject = UnknownRecord;
type ValidationFailure = { ok: false; reason: string };
type ValidationSuccess = { ok: true; config?: ComparatorConfig };
export type ComparatorConfigValidationResult =
  | ValidationSuccess
  | ValidationFailure;

const SUPPORTED_CONFIG_KEYS = new Set([
  'normalization',
  'landmarkWeights',
  'positionWeight',
  'angularWeight',
  'visibilityThreshold',
]);

const SUPPORTED_NORMALIZATION_KEYS = new Set(['center', 'scale', 'rotation']);

function fail(reason: string): ValidationFailure {
  return { ok: false, reason };
}

function isFailure(value: unknown): value is ValidationFailure {
  return isRecord(value) && value.ok === false;
}

function isPlainConfigObject(input: unknown): input is ConfigObject {
  return isRecord(input) || input instanceof Map;
}

function parseNormalization(
  value: unknown,
): Partial<NormalizationOptions> | ValidationFailure | undefined {
  if (!isRecord(value)) {
    return fail('normalization must be an object');
  }

  const normalization: Partial<NormalizationOptions> = {};
  for (const key of Object.keys(value)) {
    if (!SUPPORTED_NORMALIZATION_KEYS.has(key)) {
      return fail(`unsupported normalization field: ${key}`);
    }
  }

  if ('center' in value) {
    if (typeof value.center !== 'boolean') {
      return fail('normalization.center must be boolean');
    }
    normalization.center = value.center;
  }
  if ('scale' in value) {
    if (typeof value.scale !== 'boolean') {
      return fail('normalization.scale must be boolean');
    }
    normalization.scale = value.scale;
  }
  if ('rotation' in value) {
    if (typeof value.rotation !== 'boolean') {
      return fail('normalization.rotation must be boolean');
    }
    normalization.rotation = value.rotation;
  }

  return Object.keys(normalization).length > 0
    ? normalization
    : fail('normalization must include at least one supported field');
}

function parseLandmarkWeights(
  value: unknown,
): Map<number, number> | ValidationFailure {
  const result = new Map<number, number>();

  const setWeight = (rawKey: unknown, rawWeight: unknown) => {
    const key = typeof rawKey === 'number' ? rawKey : Number(rawKey);
    const weight = toFiniteNumber(rawWeight);
    if (!Number.isInteger(key) || key < 0 || key > 32) {
      return fail('landmarkWeights keys must be landmark indexes 0-32');
    }
    if (weight === undefined || weight < 0 || weight > 10) {
      return fail('landmarkWeights values must be finite numbers from 0 to 10');
    }
    result.set(key, weight);
    return undefined;
  };

  if (value instanceof Map) {
    for (const [rawKey, rawWeight] of value.entries()) {
      const error = setWeight(rawKey, rawWeight);
      if (error) return error;
    }
    return result.size > 0
      ? result
      : fail('landmarkWeights must include at least one entry');
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!Array.isArray(entry) || entry.length !== 2) {
        return fail('landmarkWeights array entries must be [index, weight]');
      }

      const error = setWeight(entry[0], entry[1]);
      if (error) return error;
    }
    return result.size > 0
      ? result
      : fail('landmarkWeights must include at least one entry');
  }

  if (isRecord(value)) {
    for (const [rawKey, rawWeight] of Object.entries(value)) {
      const error = setWeight(rawKey, rawWeight);
      if (error) return error;
    }
    return result.size > 0
      ? result
      : fail('landmarkWeights must include at least one entry');
  }

  return fail('landmarkWeights must be an object, array, or Map');
}

function parseUnitWeight(
  value: unknown,
  field: string,
): number | ValidationFailure {
  const parsed = toFiniteNumber(value);
  if (parsed === undefined || parsed < 0 || parsed > 1) {
    return fail(`${field} must be a finite number from 0 to 1`);
  }
  return parsed;
}

export function validateComparatorConfig(
  input: unknown,
): ComparatorConfigValidationResult {
  if (!isPlainConfigObject(input) || input instanceof Map) {
    return fail('config must be an object');
  }

  for (const key of Object.keys(input)) {
    if (!SUPPORTED_CONFIG_KEYS.has(key)) {
      return fail(`unsupported comparator config field: ${key}`);
    }
  }

  if (Object.keys(input).length === 0) {
    return { ok: true };
  }

  const config: ComparatorConfig = {};
  if ('normalization' in input) {
    const normalization = parseNormalization(input.normalization);
    if (!normalization) {
      return fail('normalization is invalid');
    }
    if (isFailure(normalization)) {
      return normalization;
    }
    config.normalization = normalization;
  }

  if ('landmarkWeights' in input) {
    const landmarkWeights = parseLandmarkWeights(input.landmarkWeights);
    if (isFailure(landmarkWeights)) {
      return landmarkWeights;
    }
    config.landmarkWeights = landmarkWeights;
  }

  if ('positionWeight' in input) {
    const positionWeight = parseUnitWeight(
      input.positionWeight,
      'positionWeight',
    );
    if (typeof positionWeight !== 'number') {
      return positionWeight;
    }
    config.positionWeight = positionWeight;
  }

  if ('angularWeight' in input) {
    const angularWeight = parseUnitWeight(input.angularWeight, 'angularWeight');
    if (typeof angularWeight !== 'number') {
      return angularWeight;
    }
    config.angularWeight = angularWeight;
  }

  if ('visibilityThreshold' in input) {
    const visibilityThreshold = parseUnitWeight(
      input.visibilityThreshold,
      'visibilityThreshold',
    );
    if (typeof visibilityThreshold !== 'number') {
      return visibilityThreshold;
    }
    config.visibilityThreshold = visibilityThreshold;
  }

  return { ok: true, config };
}

export function adaptComparatorConfig(
  input: unknown,
): ComparatorConfig | undefined {
  const result = validateComparatorConfig(input);
  return result.ok ? result.config : undefined;
}
