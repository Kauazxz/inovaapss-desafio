import { EngineConfigError } from '../shared/errors.js';
import { isFiniteNumber, round } from '../shared/math.js';

import type { SlaLookup, SlaPolicy } from './types.js';

function isValidAt(policy: SlaPolicy, at: string | undefined): boolean {
  if (policy.isActive === false) return false;
  if (at === undefined) return true;
  const time = Date.parse(at);
  if (Number.isNaN(time)) return true;
  if (policy.validFrom) {
    const from = Date.parse(policy.validFrom);
    if (!Number.isNaN(from) && time < from) return false;
  }
  if (policy.validTo) {
    const to = Date.parse(policy.validTo);
    if (!Number.isNaN(to) && time > to) return false;
  }
  return true;
}

function fieldMatches(policyValue: string | null, lookupValue: string | null): number | null {
  if (policyValue === null) return 0; // coringa: casa com tudo, sem pontuar especificidade
  if (lookupValue !== null && policyValue === lookupValue) return 1;
  return null; // não casa
}

/**
 * §14 — descobre o SLA aplicável: plano + severidade + tipo de chamado, respeitando validade.
 * Campo `null` na política é coringa. Vence a política mais específica (mais campos casados);
 * em empate, a de `validFrom` mais recente. `null` quando nenhuma se aplica.
 */
export function resolveApplicableSla(
  policies: readonly SlaPolicy[],
  lookup: SlaLookup,
): SlaPolicy | null {
  let best: { policy: SlaPolicy; specificity: number; from: number } | null = null;

  for (const policy of policies) {
    if (!isValidAt(policy, lookup.at)) continue;
    const plan = fieldMatches(policy.planId, lookup.planId);
    const severity = fieldMatches(policy.severityId, lookup.severityId);
    const type = fieldMatches(policy.ticketTypeId, lookup.ticketTypeId);
    if (plan === null || severity === null || type === null) continue;

    const specificity = plan + severity + type;
    const from = policy.validFrom ? Date.parse(policy.validFrom) : Number.NEGATIVE_INFINITY;
    const fromTime = Number.isNaN(from) ? Number.NEGATIVE_INFINITY : from;
    if (
      best === null ||
      specificity > best.specificity ||
      (specificity === best.specificity && fromTime > best.from)
    ) {
      best = { policy, specificity, from: fromTime };
    }
  }

  return best?.policy ?? null;
}

/**
 * §14 — meta operacional sugerida em minutos. PERCENT_OF_SLA: `sla × percentual / 100`
 * (SLA 120 min e meta 10 % → 12 min). ABSOLUTE_MINUTES: o valor configurado.
 * Nunca altera o SLA contratual.
 */
export function operationalTargetMinutes(
  policy: Pick<
    SlaPolicy,
    'contractualSlaMinutes' | 'operationalTargetType' | 'operationalTargetValue'
  >,
): number {
  const {
    contractualSlaMinutes: sla,
    operationalTargetType: type,
    operationalTargetValue: value,
  } = policy;
  if (!isFiniteNumber(sla) || sla <= 0) {
    throw new EngineConfigError('SLA contratual deve ser maior que zero (minutos).');
  }
  if (!isFiniteNumber(value) || value <= 0) {
    throw new EngineConfigError('Meta operacional deve ser maior que zero.');
  }
  switch (type) {
    case 'PERCENT_OF_SLA':
      return round((sla * value) / 100, 4);
    case 'ABSOLUTE_MINUTES':
      return value;
    default:
      throw new EngineConfigError(`Tipo de meta operacional desconhecido: ${String(type)}.`);
  }
}
