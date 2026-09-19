import { evaluateSafeRuleAsBoolean } from './safe-rule.js';
import { EngineConfigError } from '../shared/errors.js';
import { fillTemplate, formatNumber } from '../shared/format.js';
import { isFiniteNumber } from '../shared/math.js';

import type {
  ComparisonOperator,
  RuleContext,
  StreakTrigger,
  ThresholdTrigger,
  TriggerConfig,
  TriggerEvaluation,
  TriggerHit,
} from './types.js';

/** Compara dois números com um operador configurado. */
export function compare(left: number, operator: ComparisonOperator, right: number): boolean {
  switch (operator) {
    case '>':
      return left > right;
    case '>=':
      return left >= right;
    case '<':
      return left < right;
    case '<=':
      return left <= right;
    case '==':
      return left === right;
    case '!=':
      return left !== right;
    default:
      throw new EngineConfigError(`Gatilho: operador desconhecido ${String(operator)}.`);
  }
}

function readField(context: RuleContext, field: ThresholdTrigger['field']): number | null {
  if (field === 'value') return isFiniteNumber(context.value) ? context.value : null;
  if (field === 'health') return isFiniteNumber(context.health) ? context.health : null;
  const key = field.slice('extra.'.length);
  const raw = context.extra?.[key];
  return isFiniteNumber(raw) ? raw : null;
}

function thresholdFires(trigger: ThresholdTrigger, context: RuleContext): boolean {
  const current = readField(context, trigger.field);
  if (current === null) return false; // dado ausente não dispara gatilho
  return compare(current, trigger.operator, trigger.threshold);
}

function streakFires(trigger: StreakTrigger, context: RuleContext): boolean {
  if (!Number.isInteger(trigger.consecutivePeriods) || trigger.consecutivePeriods < 1) {
    throw new EngineConfigError('Gatilho STREAK: consecutivePeriods deve ser um inteiro ≥ 1.');
  }
  // Um período sem dado quebra a sequência: "consecutivo" exige dado em todos os períodos.
  const series = context.series ?? [...context.history, context.value];
  const tail = series.slice(-trigger.consecutivePeriods);
  if (tail.length < trigger.consecutivePeriods) return false;
  return tail.every((v) => isFiniteNumber(v) && compare(v, trigger.operator, trigger.threshold));
}

function defaultMessage(trigger: TriggerConfig, context: RuleContext): string {
  const value = isFiniteNumber(context.value) ? formatNumber(context.value) : '—';
  switch (trigger.kind) {
    case 'THRESHOLD':
      return `${trigger.name}: ${trigger.field} ${trigger.operator} ${formatNumber(trigger.threshold)} (atual ${value}).`;
    case 'STREAK':
      return `${trigger.name}: ${trigger.operator} ${formatNumber(trigger.threshold)} há ${trigger.consecutivePeriods} períodos consecutivos.`;
    case 'JSON_LOGIC':
    default:
      return `${trigger.name}: condição atendida (atual ${value}).`;
  }
}

function fires(trigger: TriggerConfig, context: RuleContext): boolean {
  switch (trigger.kind) {
    case 'THRESHOLD':
      return thresholdFires(trigger, context);
    case 'STREAK':
      return streakFires(trigger, context);
    case 'JSON_LOGIC':
      return evaluateSafeRuleAsBoolean(trigger.rule, context);
    default:
      throw new EngineConfigError(
        `Gatilho: tipo desconhecido ${String((trigger as { kind: string }).kind)}.`,
      );
  }
}

/**
 * Avalia gatilhos críticos (§27) de forma independente do peso: um gatilho disparado gera alerta e,
 * opcionalmente, um piso de prioridade — nunca altera o health da métrica.
 */
export function evaluateTriggers(
  triggers: readonly TriggerConfig[] | undefined,
  context: RuleContext,
  metricId: string | null = null,
): TriggerEvaluation {
  const hits: TriggerHit[] = [];
  let priorityFloor: number | null = null;

  for (const trigger of triggers ?? []) {
    if (trigger.isActive === false) continue;
    if (!fires(trigger, context)) continue;

    const floor = isFiniteNumber(trigger.priorityFloor)
      ? Math.min(100, Math.max(0, trigger.priorityFloor))
      : null;
    if (floor !== null)
      priorityFloor = priorityFloor === null ? floor : Math.max(priorityFloor, floor);

    const message = trigger.message
      ? fillTemplate(trigger.message, {
          name: trigger.name,
          value: context.value,
          health: context.health ?? null,
          threshold: trigger.kind === 'JSON_LOGIC' ? null : trigger.threshold,
          periods: trigger.kind === 'STREAK' ? trigger.consecutivePeriods : null,
          ...Object.fromEntries(
            Object.entries(context.extra ?? {}).map(([k, v]) => [
              `extra.${k}`,
              v === null ? null : String(v),
            ]),
          ),
        })
      : defaultMessage(trigger, context);

    hits.push({
      triggerId: trigger.id,
      name: trigger.name,
      severity: trigger.severity ?? 'CRITICAL',
      priorityFloor: floor,
      message,
      metricId,
    });
  }

  return { hits, priorityFloor };
}

/** Junta avaliações de várias métricas: todos os alertas e o maior piso. */
export function mergeTriggerEvaluations(
  evaluations: readonly TriggerEvaluation[],
): TriggerEvaluation {
  const hits = evaluations.flatMap((e) => e.hits);
  const floors = evaluations.map((e) => e.priorityFloor).filter(isFiniteNumber);
  return { hits, priorityFloor: floors.length > 0 ? Math.max(...floors) : null };
}
