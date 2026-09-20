/**
 * §36 — metric_values e os snapshots de pontuação (Etapa 4).
 *
 * metric_values guarda o dado bruto por cliente, métrica e período (o que vem da planilha, de um
 * CSV/JSON ou da digitação). Os snapshots guardam o RESULTADO do cálculo: um por métrica
 * (metric_score_snapshots) e um por cliente (client_score_snapshots), sempre com a versão do
 * modelo que os gerou (§32 do documento de métricas) — mudar peso ou faixa nunca reescreve o
 * histórico, gera um snapshot novo.
 *
 * O dashboard e a tela do cliente leem snapshots, não recalculam a cada requisição (§62).
 *
 * RLS (§5): mesmo padrão das demais tabelas — membro lê, owner/admin escreve; a API fala como
 * service_role e o isolamento real é o filtro por organization_id em toda query.
 */
import { sql, type SQL } from 'drizzle-orm';
import {
  type AnyPgColumn,
  date,
  index,
  jsonb,
  numeric,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { portfolioClients } from './clients.js';
import { metricDefinitions, metricModelVersions, metricSourceEnum } from './metrics.js';
import { organizations } from './organizations.js';

const memberOf = (organizationId: AnyPgColumn): SQL =>
  sql`${organizationId} in (select public.current_user_organization_ids())`;
const writerOf = (organizationId: AnyPgColumn): SQL =>
  sql`public.current_user_role_in(${organizationId}) in ('owner', 'admin', 'analyst')`;

/** select para membros; escrita para owner/admin/analyst (quem importa dados e recalcula). */
function scorePolicies(prefix: string, organizationId: AnyPgColumn) {
  return [
    pgPolicy(`${prefix}_select_member`, {
      for: 'select',
      to: 'authenticated',
      using: memberOf(organizationId),
    }),
    pgPolicy(`${prefix}_insert_writer`, {
      for: 'insert',
      to: 'authenticated',
      withCheck: writerOf(organizationId),
    }),
    pgPolicy(`${prefix}_update_writer`, {
      for: 'update',
      to: 'authenticated',
      using: writerOf(organizationId),
      withCheck: writerOf(organizationId),
    }),
    pgPolicy(`${prefix}_delete_writer`, {
      for: 'delete',
      to: 'authenticated',
      using: writerOf(organizationId),
    }),
  ];
}

/** Health/score 0–100 com duas casas. */
const score = (name: string) => numeric(name, { precision: 5, scale: 2, mode: 'number' });

// ---------------------------------------------------------------------------
// metric_values — dado bruto por cliente, métrica e período
// ---------------------------------------------------------------------------
export const metricValues = pgTable(
  'metric_values',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    portfolioClientId: uuid('portfolio_client_id')
      .notNull()
      .references(() => portfolioClients.id, { onDelete: 'cascade' }),
    metricDefinitionId: uuid('metric_definition_id')
      .notNull()
      .references(() => metricDefinitions.id, { onDelete: 'cascade' }),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    /** Valor numérico do período. Null = não medido (N/A), nunca zero por ausência. */
    rawValueNumeric: numeric('raw_value_numeric', { precision: 18, scale: 4, mode: 'number' }),
    /** Valor textual (categorias, mapas de score). */
    rawValueText: text('raw_value_text'),
    /**
     * §16 do documento de métricas: o cliente foi consultado e NÃO respondeu (NPS e pesquisas).
     * Diferente de "não medido" — por isso é uma coluna própria, e não um valor nulo.
     */
    answered: text('answered'),
    source: metricSourceEnum('source').notNull().default('MANUAL'),
    sourceReference: text('source_reference'),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('metric_values_client_metric_period_unique').on(
      table.portfolioClientId,
      table.metricDefinitionId,
      table.periodStart,
    ),
    index('metric_values_organization_idx').on(table.organizationId),
    index('metric_values_period_idx').on(table.organizationId, table.periodEnd),
    ...scorePolicies('metric_values', table.organizationId),
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// metric_score_snapshots — resultado por métrica
// ---------------------------------------------------------------------------
export const metricScoreSnapshots = pgTable(
  'metric_score_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    portfolioClientId: uuid('portfolio_client_id')
      .notNull()
      .references(() => portfolioClients.id, { onDelete: 'cascade' }),
    metricDefinitionId: uuid('metric_definition_id')
      .notNull()
      .references(() => metricDefinitions.id, { onDelete: 'cascade' }),
    metricModelVersionId: uuid('metric_model_version_id')
      .notNull()
      .references(() => metricModelVersions.id, { onDelete: 'cascade' }),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    /** §4 do documento: os três componentes e a composição 45/35/20. Null = não avaliável. */
    currentHealth: score('current_health'),
    trendHealth: score('trend_health'),
    persistenceHealth: score('persistence_health'),
    metricHealth: score('metric_health'),
    /** 0–1: cai quando falta componente ou histórico (§19 do documento). */
    confidence: numeric('confidence', { precision: 4, scale: 3, mode: 'number' }),
    /** Evidência legível (§23): valor, baseline, variação, tendência, contribuição e explicação. */
    explanationJson: jsonb('explanation_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('metric_score_snapshots_unique').on(
      table.portfolioClientId,
      table.metricDefinitionId,
      table.metricModelVersionId,
      table.periodEnd,
    ),
    index('metric_score_snapshots_organization_idx').on(table.organizationId),
    ...scorePolicies('metric_score_snapshots', table.organizationId),
  ],
).enableRLS();

// ---------------------------------------------------------------------------
// client_score_snapshots — resultado do cliente
// ---------------------------------------------------------------------------
export const clientScoreSnapshots = pgTable(
  'client_score_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    portfolioClientId: uuid('portfolio_client_id')
      .notNull()
      .references(() => portfolioClients.id, { onDelete: 'cascade' }),
    metricModelVersionId: uuid('metric_model_version_id')
      .notNull()
      .references(() => metricModelVersions.id, { onDelete: 'cascade' }),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    /** §2 e §3 do documento: saúde 0–100 e risco = 100 − saúde. */
    overallHealth: score('overall_health'),
    riskScore: score('risk_score'),
    /** §19: mostrada sempre ao lado da saúde, nunca misturada com ela. */
    analysisConfidence: score('analysis_confidence'),
    /** §20: impacto comercial e a prioridade resultante. */
    commercialImpactScore: score('commercial_impact_score'),
    priorityScore: score('priority_score'),
    /** §22: piso de prioridade imposto por um gatilho crítico. */
    priorityFloor: score('priority_floor'),
    healthClass: text('health_class'),
    priorityClass: text('priority_class'),
    /** Drivers ordenados por contribuição (§23) e os gatilhos que dispararam. */
    evidenceJson: jsonb('evidence_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('client_score_snapshots_unique').on(
      table.portfolioClientId,
      table.metricModelVersionId,
      table.periodEnd,
    ),
    index('client_score_snapshots_organization_period_idx').on(
      table.organizationId,
      table.periodEnd,
    ),
    ...scorePolicies('client_score_snapshots', table.organizationId),
  ],
).enableRLS();
