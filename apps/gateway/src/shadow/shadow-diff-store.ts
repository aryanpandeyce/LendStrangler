import { ShadowDiffRecord } from '@lendstrangler/contracts';

export class ShadowDiffStore {
  private records: ShadowDiffRecord[] = [];
  private maxRecords = 100;

  public recordDiff(diff: Omit<ShadowDiffRecord, 'id' | 'timestamp'>): ShadowDiffRecord {
    const fullRecord: ShadowDiffRecord = {
      ...diff,
      id: `diff-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
    };

    this.records.unshift(fullRecord);
    if (this.records.length > this.maxRecords) {
      this.records.pop();
    }

    return fullRecord;
  }

  public getRecords(limit = 50): ShadowDiffRecord[] {
    return this.records.slice(0, limit);
  }

  public getSummary() {
    const total = this.records.length;
    const matches = this.records.filter((r) => r.isEqual).length;
    const matchRate = total > 0 ? Math.round((matches / total) * 1000) / 10 : 100;
    const avgLegacyLatency =
      total > 0
        ? Math.round(this.records.reduce((acc, r) => acc + r.legacyLatencyMs, 0) / total)
        : 0;
    const avgNewLatency =
      total > 0
        ? Math.round(this.records.reduce((acc, r) => acc + r.newLatencyMs, 0) / total)
        : 0;

    return {
      totalShadowRequests: total,
      exactMatches: matches,
      matchRatePercent: matchRate,
      avgLegacyLatencyMs: avgLegacyLatency,
      avgNewLatencyMs: avgNewLatency,
      latencySavingsMs: avgLegacyLatency - avgNewLatency,
    };
  }

  public clear() {
    this.records = [];
  }
}

/**
 * Utility to deep compare JSON payloads and extract field-level differences,
 * ignoring volatile metadata (e.g. timestamps, evaluation IDs).
 */
export function comparePayloads(
  legacy: unknown,
  modern: unknown,
  ignoreFields = ['id', 'evaluatedAt', 'createdAt', 'updatedAt', 'timestamp'],
): { isEqual: boolean; differences: Array<{ field: string; legacyValue: unknown; newValue: unknown }> } {
  const differences: Array<{ field: string; legacyValue: unknown; newValue: unknown }> = [];

  if (typeof legacy !== typeof modern) {
    differences.push({ field: 'root_type', legacyValue: typeof legacy, newValue: typeof modern });
    return { isEqual: false, differences };
  }

  if (typeof legacy !== 'object' || legacy === null || modern === null) {
    if (legacy !== modern) {
      differences.push({ field: 'value', legacyValue: legacy, newValue: modern });
      return { isEqual: false, differences };
    }
    return { isEqual: true, differences: [] };
  }

  const legacyObj = legacy as Record<string, unknown>;
  const modernObj = modern as Record<string, unknown>;

  const allKeys = Array.from(new Set([...Object.keys(legacyObj), ...Object.keys(modernObj)]));

  for (const key of allKeys) {
    if (ignoreFields.includes(key)) continue;

    const val1 = legacyObj[key];
    const val2 = modernObj[key];

    if (val1 === undefined && val2 !== undefined) {
      differences.push({ field: key, legacyValue: undefined, newValue: val2 });
    } else if (val1 !== undefined && val2 === undefined) {
      differences.push({ field: key, legacyValue: val1, newValue: undefined });
    } else if (typeof val1 === 'object' && val1 !== null && typeof val2 === 'object' && val2 !== null) {
      const nested = comparePayloads(val1, val2, ignoreFields);
      for (const diff of nested.differences) {
        differences.push({ field: `${key}.${diff.field}`, legacyValue: diff.legacyValue, newValue: diff.newValue });
      }
    } else if (val1 !== val2) {
      differences.push({ field: key, legacyValue: val1, newValue: val2 });
    }
  }

  return {
    isEqual: differences.length === 0,
    differences,
  };
}
