import jsonLogic from 'json-logic-js';

import { UnsafeRuleError } from '../shared/errors.js';

import type { JsonLogicRule, RuleContext } from './types.js';

/**
 * Operadores JSON Logic permitidos em CUSTOM_SAFE_RULE e em gatilhos.
 * Fica de fora, de propósito, o `method` (chama métodos arbitrários de objetos) e qualquer
 * operador registrado por `add_operation`. Nunca há `eval` (§2, §9, §45).
 *
 * Também ficam de fora `merge` e `cat`: são os únicos operadores que produzem um resultado
 * maior que a entrada, e dentro de `reduce` dobram o acumulador a cada período do histórico
 * (2^n itens — esgotam a memória do processo com uma regra "válida"). Voltam só com caso de uso
 * real e uma versão limitada registrada pelo motor.
 */
export const ALLOWED_RULE_OPERATORS: ReadonlySet<string> = new Set([
  'var',
  'missing',
  'missing_some',
  'if',
  '?:',
  '==',
  '===',
  '!=',
  '!==',
  '!',
  '!!',
  'or',
  'and',
  '>',
  '>=',
  '<',
  '<=',
  'max',
  'min',
  '+',
  '-',
  '*',
  '/',
  '%',
  'map',
  'filter',
  'reduce',
  'all',
  'some',
  'none',
  'in',
  'substr',
]);

const FORBIDDEN_PATH_SEGMENTS = new Set(['constructor', '__proto__', 'prototype']);
const MAX_NODES = 500;
const MAX_DEPTH = 30;
/**
 * Quantos períodos de `history`/`series` uma regra enxerga (os mais recentes). Limita o custo de
 * `map`/`filter`/`reduce`/`all`/`some`/`none` sobre a série: a janela de tendência e de
 * persistência é 3 (§10, §11); 60 períodos são cinco anos mensais.
 */
export const MAX_RULE_SERIES_LENGTH = 60;
/** Operadores que recebem caminhos do contexto como argumento (além de `var`). */
const PATH_OPERATORS = new Set(['var', 'missing', 'missing_some']);

function assertSafePath(path: unknown): void {
  if (typeof path !== 'string') return;
  for (const segment of path.split('.')) {
    if (FORBIDDEN_PATH_SEGMENTS.has(segment)) {
      throw new UnsafeRuleError(`Regra recusada: caminho "${path}" não é permitido.`);
    }
  }
}

/** Confere todos os textos literais dentro dos argumentos (`missing: ['a', 'b']`, `missing_some: [1, [...]]`). */
function assertSafePaths(args: unknown): void {
  if (Array.isArray(args)) {
    for (const item of args) assertSafePaths(item);
    return;
  }
  assertSafePath(args);
}

function walk(node: unknown, depth: number, counter: { nodes: number }): void {
  counter.nodes += 1;
  if (counter.nodes > MAX_NODES) {
    throw new UnsafeRuleError(`Regra recusada: mais de ${MAX_NODES} nós.`);
  }
  if (depth > MAX_DEPTH) {
    throw new UnsafeRuleError(`Regra recusada: profundidade maior que ${MAX_DEPTH}.`);
  }
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, depth + 1, counter);
    return;
  }
  const keys = Object.keys(node);
  if (keys.length !== 1) {
    throw new UnsafeRuleError(
      'Regra recusada: cada nó deve ter exatamente um operador (objeto com uma chave).',
    );
  }
  const operator = keys[0] as string;
  if (!ALLOWED_RULE_OPERATORS.has(operator)) {
    throw new UnsafeRuleError(`Regra recusada: operador "${operator}" não é permitido.`);
  }
  const args = (node as Record<string, unknown>)[operator];
  if (PATH_OPERATORS.has(operator)) assertSafePaths(args);
  if (operator === 'var') {
    const first = Array.isArray(args) ? args[0] : args;
    if (first !== null && typeof first === 'object') {
      throw new UnsafeRuleError('Regra recusada: o caminho de "var" deve ser um texto literal.');
    }
  }
  if (Array.isArray(args)) {
    for (const item of args) walk(item, depth + 1, counter);
  } else {
    walk(args, depth + 1, counter);
  }
}

/**
 * Valida uma regra antes de avaliá-la. Lança `UnsafeRuleError` se houver operador fora da
 * allowlist, caminho perigoso, nó malformado ou regra grande demais.
 */
export function assertSafeRule(rule: JsonLogicRule): void {
  walk(rule, 0, { nodes: 0 });
}

/** `true` se a regra passa na validação, sem lançar. */
export function isSafeRule(rule: JsonLogicRule): boolean {
  try {
    assertSafeRule(rule);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copia o contexto para objetos sem protótipo (nada de `constructor` acessível pela regra) e
 * corta `history`/`series` aos últimos `MAX_RULE_SERIES_LENGTH` períodos.
 */
function sanitizeContext(context: RuleContext): Record<string, unknown> {
  const clone = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.slice(-MAX_RULE_SERIES_LENGTH).map(clone);
    if (input !== null && typeof input === 'object') {
      const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      for (const [key, value] of Object.entries(input)) {
        if (!FORBIDDEN_PATH_SEGMENTS.has(key)) out[key] = clone(value);
      }
      return out;
    }
    if (typeof input === 'function') return null;
    return input;
  };
  return clone(context) as Record<string, unknown>;
}

/**
 * Avalia uma regra segura sobre o contexto. Devolve o resultado cru (número, booleano...).
 * Erros de execução viram `null` — a regra nunca derruba o motor.
 */
export function evaluateSafeRule(rule: JsonLogicRule, context: RuleContext): unknown {
  assertSafeRule(rule);
  try {
    return jsonLogic.apply(rule as Parameters<typeof jsonLogic.apply>[0], sanitizeContext(context));
  } catch {
    return null;
  }
}

/** Avalia e força número finito; qualquer outra coisa vira `null` (N/A). */
export function evaluateSafeRuleAsNumber(rule: JsonLogicRule, context: RuleContext): number | null {
  const result = evaluateSafeRule(rule, context);
  if (typeof result === 'number' && Number.isFinite(result)) return result;
  if (typeof result === 'boolean') return result ? 1 : 0;
  return null;
}

/** Avalia e força booleano (truthy do JSON Logic). */
export function evaluateSafeRuleAsBoolean(rule: JsonLogicRule, context: RuleContext): boolean {
  return jsonLogic.truthy(evaluateSafeRule(rule, context));
}
