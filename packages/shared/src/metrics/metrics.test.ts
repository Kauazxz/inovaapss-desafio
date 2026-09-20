import { describe, expect, it } from 'vitest';

import {
  METRIC_DIRECTIONS,
  METRIC_SOURCES,
  METRIC_TYPES,
  NORMALIZATION_STRATEGIES,
  WEIGHT_MODES,
} from '../domain.js';
import { METRIC_MODEL_VERSION_STATUSES, METRIC_PERIODICITIES } from './enums.js';
import {
  METRIC_DIRECTION_LABELS,
  METRIC_MODEL_VERSION_STATUS_LABELS,
  METRIC_PERIODICITY_LABELS,
  METRIC_SOURCE_LABELS,
  METRIC_TYPE_LABELS,
  NORMALIZATION_STRATEGY_LABELS,
  WEIGHT_MODE_LABELS,
} from './labels.js';
import { GLOBALSYS_V1_KEYS, GLOBALSYS_V1_PRESET } from './preset.js';

describe('preset GlobalSys v1 (§71)', () => {
  it('tem 10 chaves únicas na ordem oficial', () => {
    expect(GLOBALSYS_V1_KEYS).toHaveLength(10);
    expect(new Set(GLOBALSYS_V1_KEYS).size).toBe(10);
    expect(GLOBALSYS_V1_KEYS[0]).toBe('critical_tickets');
    expect(GLOBALSYS_V1_KEYS[9]).toBe('nps_dissatisfaction');
    expect(GLOBALSYS_V1_PRESET.map((p) => p.key)).toEqual([...GLOBALSYS_V1_KEYS]);
    expect(GLOBALSYS_V1_PRESET.map((p) => p.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('os pesos somam exatamente 1,00', () => {
    const total = GLOBALSYS_V1_PRESET.reduce((acc, p) => acc + p.weight, 0);
    expect(Math.round(total * 10000) / 10000).toBe(1);
  });
});

describe('rótulos em português', () => {
  const cover = (values: readonly string[], labels: Readonly<Record<string, string>>) => {
    for (const value of values) {
      expect(labels[value], `falta rótulo para ${value}`).toBeTruthy();
    }
  };

  it('cobrem todos os enums', () => {
    cover(METRIC_TYPES, METRIC_TYPE_LABELS);
    cover(METRIC_DIRECTIONS, METRIC_DIRECTION_LABELS);
    cover(METRIC_SOURCES, METRIC_SOURCE_LABELS);
    cover(NORMALIZATION_STRATEGIES, NORMALIZATION_STRATEGY_LABELS);
    cover(METRIC_PERIODICITIES, METRIC_PERIODICITY_LABELS);
    cover(WEIGHT_MODES, WEIGHT_MODE_LABELS);
    cover(METRIC_MODEL_VERSION_STATUSES, METRIC_MODEL_VERSION_STATUS_LABELS);
  });
});
