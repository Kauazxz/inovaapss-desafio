/**
 * Estado do editor de gatilhos críticos (§22, §27): a lista persistida vira linhas de TEXTO e
 * volta a ser a lista crua na hora de validar com o `triggerListSchema` de @inovaapss/validation.
 *
 * Peso contribui para o score; gatilho gera ação imediata — por isso cada gatilho pode impor um
 * piso de prioridade e vira alerta no recálculo.
 */
import { toNumber } from './format';

export type TriggerKind = 'THRESHOLD' | 'STREAK' | 'JSON_LOGIC';

/** Um gatilho em edição: tudo texto, como nos demais campos do painel. */
export interface TriggerRow {
  id: string;
  name: string;
  kind: TriggerKind;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  priorityFloor: string;
  /** THRESHOLD: 'value', 'health' ou 'extra.<campo>'. */
  field: string;
  operator: '>' | '>=' | '<' | '<=' | '==' | '!=';
  threshold: string;
  /** STREAK: quantos períodos seguidos. */
  consecutivePeriods: string;
  /** JSON_LOGIC: a regra em JSON. */
  rule: string;
}

type Rec = Record<string, unknown>;

function asRecord(value: unknown): Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Rec) : {};
}

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

export function triggersToRows(config: unknown): TriggerRow[] {
  if (!Array.isArray(config)) return [];
  return config.map((raw) => {
    const t = asRecord(raw);
    return {
      id: text(t.id),
      name: text(t.name),
      kind: (text(t.kind) || 'THRESHOLD') as TriggerKind,
      severity: (text(t.severity) || 'WARNING') as TriggerRow['severity'],
      message: text(t.message),
      priorityFloor: text(t.priorityFloor),
      field: text(t.field) === '' ? 'value' : text(t.field),
      operator: (text(t.operator) || '>=') as TriggerRow['operator'],
      threshold: text(t.threshold),
      consecutivePeriods: text(t.consecutivePeriods),
      rule: t.rule === undefined ? '' : JSON.stringify(t.rule, null, 2),
    };
  });
}

export function emptyTriggerRow(index: number): TriggerRow {
  return {
    id: `gatilho-${index + 1}`,
    name: '',
    kind: 'THRESHOLD',
    severity: 'WARNING',
    message: '',
    priorityFloor: '',
    field: 'value',
    operator: '>=',
    threshold: '',
    consecutivePeriods: '2',
    rule: '',
  };
}

export class TriggerRuleError extends Error {}

/**
 * Linhas → lista crua para o Zod. Lança `TriggerRuleError` quando o JSON de uma regra não é
 * sequer JSON (o resto dos erros vem do schema, com a mensagem da API).
 */
export function rowsToTriggers(rows: readonly TriggerRow[]): unknown[] {
  return rows.map((row) => {
    const base: Rec = { id: row.id.trim(), name: row.name.trim(), severity: row.severity };
    if (row.message.trim() !== '') base.message = row.message.trim();
    if (row.priorityFloor.trim() !== '') base.priorityFloor = toNumber(row.priorityFloor);
    if (row.kind === 'THRESHOLD') {
      return {
        ...base,
        kind: 'THRESHOLD',
        field: row.field.trim(),
        operator: row.operator,
        threshold: toNumber(row.threshold),
      };
    }
    if (row.kind === 'STREAK') {
      return {
        ...base,
        kind: 'STREAK',
        operator: row.operator,
        threshold: toNumber(row.threshold),
        consecutivePeriods: toNumber(row.consecutivePeriods),
      };
    }
    try {
      return { ...base, kind: 'JSON_LOGIC', rule: JSON.parse(row.rule) };
    } catch {
      throw new TriggerRuleError(
        `O gatilho "${row.name.trim() === '' ? row.id : row.name}" tem um JSON inválido na regra.`,
      );
    }
  });
}
