/**
 * Dimensões da visão individual do cliente (§40): cada aba de série temporal agrupa as métricas
 * de uma dimensão. São as mesmas dimensões da aba "Geral" do dashboard (DATAVIZ.md §4.2).
 * A organização pode remapear suas métricas para estas dimensões; o motor não depende delas.
 */
export const CLIENT_HEALTH_DIMENSIONS = [
  'support',
  'sla',
  'usage',
  'nps',
  'financial',
  'meetings',
] as const;
export type ClientHealthDimension = (typeof CLIENT_HEALTH_DIMENSIONS)[number];
export const ClientHealthDimension = {
  SUPPORT: 'support',
  SLA: 'sla',
  USAGE: 'usage',
  NPS: 'nps',
  FINANCIAL: 'financial',
  MEETINGS: 'meetings',
} as const satisfies Record<string, ClientHealthDimension>;

/** Rótulos em português — os nomes das abas de §40. */
export const CLIENT_HEALTH_DIMENSION_LABELS: Readonly<Record<ClientHealthDimension, string>> = {
  support: 'Atendimento',
  sla: 'SLA',
  usage: 'Uso',
  nps: 'NPS',
  financial: 'Financeiro',
  meetings: 'Reuniões',
};
