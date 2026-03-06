type LongLike = {
  toNumber?: () => number;
};

export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (isRecord(value)) {
    const longLike = value as LongLike;
    if (typeof longLike.toNumber === 'function') {
      const numberValue = longLike.toNumber();
      if (Number.isFinite(numberValue)) {
        return numberValue;
      }
    }
  }

  return undefined;
}

export function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
