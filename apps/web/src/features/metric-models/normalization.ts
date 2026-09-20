/**
 * Estado do editor de normalização (§9): a configuração persistida vira campos de TEXTO e volta
 * a ser um objeto cru na hora de validar. Quem valida é o `normalizationConfigSchema` de
 * @inovaapss/validation — o mesmo schema da API, então o que a tela aceita é o que o banco aceita.
 */
import type { NormalizationStrategy } from '@inovaapss/shared';

import { toNumber } from './format';

export interface BandRow {
  /** Vazio = `null`, a faixa que recebe tudo o que sobrar (obrigatória no fim). */
  upTo: string;
  health: string;
}

export interface MapRow {
  key: string;
  health: string;
}

export interface NormalizationState {
  strategy: NormalizationStrategy;
  fields: Record<string, string>;
  bands: BandRow[];
  entries: MapRow[];
  /** Só para CUSTOM_SAFE_RULE: o JSON da configuração inteira. */
  json: string;
}

type Rec = Record<string, unknown>;

function asRecord(value: unknown): Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Rec) : {};
}

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

/** Configuração persistida → estado do editor. */
export function normalizationToState(config: unknown): NormalizationState {
  const c = asRecord(config);
  const strategy = (c.strategy as NormalizationStrategy | undefined) ?? 'LINEAR_RANGE';
  const target = asRecord(c.target);
  const fields: Record<string, string> = {
    min: text(c.min),
    max: text(c.max),
    targetMin: text(target.min),
    targetMax: text(target.max),
    target: typeof c.target === 'number' ? String(c.target) : '',
    zeroAtRatio: text(c.zeroAtRatio),
    tolerance: text(c.tolerance),
    zeroAtDeviation: text(c.zeroAtDeviation),
    window: text(c.window),
    minHistory: text(c.minHistory),
    method: text(c.method) === '' ? 'auto' : text(c.method),
    outlierFactor: text(c.outlierFactor),
    tolerancePct: text(c.tolerancePct),
    maxDeviationPct: text(c.maxDeviationPct),
    combine: text(c.combine) === '' ? 'worst' : text(c.combine),
    trueHealth: text(c.trueHealth),
    falseHealth: text(c.falseHealth),
    defaultHealth: text(c.defaultHealth),
  };
  const bands = (Array.isArray(c.bands) ? c.bands.map(asRecord) : []).map((band) => ({
    upTo: band.upTo === null || band.upTo === undefined ? '' : String(band.upTo),
    health: text(band.health),
  }));
  const entries = Object.entries(asRecord(c.map)).map(([key, value]) => ({
    key,
    health: text(value),
  }));
  return {
    strategy,
    fields,
    bands: bands.length > 0 ? bands : [{ upTo: '', health: '100' }],
    entries,
    json: strategy === 'CUSTOM_SAFE_RULE' ? JSON.stringify(config, null, 2) : '',
  };
}

function put(out: Rec, key: string, raw: string): void {
  if (raw.trim() === '') return;
  out[key] = toNumber(raw);
}

/**
 * Estado do editor → objeto cru para o Zod. Campo em branco é campo ausente (opcional), nunca
 * zero: um limite que ninguém preencheu não pode virar "limite zero".
 */
export function stateToConfig(state: NormalizationState): unknown {
  const f = state.fields;
  switch (state.strategy) {
    case 'THRESHOLD_BANDS':
      return {
        strategy: 'THRESHOLD_BANDS',
        bands: state.bands.map((band) => ({
          upTo: band.upTo.trim() === '' ? null : toNumber(band.upTo),
          health: toNumber(band.health),
        })),
      };
    case 'LINEAR_RANGE': {
      const out: Rec = {
        strategy: 'LINEAR_RANGE',
        min: toNumber(f.min ?? ''),
        max: toNumber(f.max ?? ''),
      };
      if ((f.targetMin ?? '').trim() !== '' || (f.targetMax ?? '').trim() !== '') {
        out.target = { min: toNumber(f.targetMin ?? ''), max: toNumber(f.targetMax ?? '') };
      }
      return out;
    }
    case 'RATIO_TO_TARGET': {
      const out: Rec = { strategy: 'RATIO_TO_TARGET', target: toNumber(f.target ?? '') };
      put(out, 'zeroAtRatio', f.zeroAtRatio ?? '');
      put(out, 'tolerance', f.tolerance ?? '');
      put(out, 'zeroAtDeviation', f.zeroAtDeviation ?? '');
      return out;
    }
    case 'BASELINE_DEVIATION': {
      const out: Rec = { strategy: 'BASELINE_DEVIATION' };
      put(out, 'window', f.window ?? '');
      put(out, 'minHistory', f.minHistory ?? '');
      put(out, 'outlierFactor', f.outlierFactor ?? '');
      put(out, 'tolerancePct', f.tolerancePct ?? '');
      put(out, 'maxDeviationPct', f.maxDeviationPct ?? '');
      if ((f.method ?? '') !== '') out.method = f.method;
      if ((f.combine ?? '') !== '') out.combine = f.combine;
      return out;
    }
    case 'BOOLEAN_MAP': {
      const out: Rec = { strategy: 'BOOLEAN_MAP' };
      put(out, 'trueHealth', f.trueHealth ?? '');
      put(out, 'falseHealth', f.falseHealth ?? '');
      return out;
    }
    case 'SCORE_MAP': {
      const map: Rec = {};
      for (const entry of state.entries) {
        if (entry.key.trim() === '') continue;
        map[entry.key.trim()] = toNumber(entry.health);
      }
      const out: Rec = { strategy: 'SCORE_MAP', map };
      put(out, 'defaultHealth', f.defaultHealth ?? '');
      return out;
    }
    case 'CUSTOM_SAFE_RULE':
    default:
      return null;
  }
}

/** Exemplo pronto para quem começa uma regra segura do zero. */
export const CUSTOM_RULE_EXAMPLE = JSON.stringify(
  {
    strategy: 'CUSTOM_SAFE_RULE',
    rule: { if: [{ '>': [{ var: 'value' }, 0] }, 100, 0] },
    output: 'health',
  },
  null,
  2,
);
