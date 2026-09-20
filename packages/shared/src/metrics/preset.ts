/**
 * §71 — preset oficial GlobalSys v1: as 10 chaves canônicas (slugs das definições) na ordem do
 * modelo, com os pesos iniciais. A Etapa 6 cria o seed a partir daqui; a Etapa 3 só fixa o
 * vocabulário para ninguém digitar a chave de um jeito diferente.
 */
export const GLOBALSYS_V1_KEYS = [
  'critical_tickets',
  'resolution_vs_sla',
  'platform_usage',
  'sla_compliance',
  'reopened_tickets',
  'formal_complaints',
  'open_tickets',
  'payment_delay',
  'missed_meetings',
  'nps_dissatisfaction',
] as const;
export type GlobalSysV1Key = (typeof GLOBALSYS_V1_KEYS)[number];

export interface GlobalSysV1PresetItem {
  readonly order: number;
  readonly key: GlobalSysV1Key;
  /** Fração 0–1 (§71); as 10 somam 1,00. */
  readonly weight: number;
}

/** §12/§71 — ordem e peso inicial de cada chave (calibráveis depois). */
export const GLOBALSYS_V1_PRESET: readonly GlobalSysV1PresetItem[] = [
  { order: 1, key: 'critical_tickets', weight: 0.18 },
  { order: 2, key: 'resolution_vs_sla', weight: 0.16 },
  { order: 3, key: 'platform_usage', weight: 0.14 },
  { order: 4, key: 'sla_compliance', weight: 0.12 },
  { order: 5, key: 'reopened_tickets', weight: 0.1 },
  { order: 6, key: 'formal_complaints', weight: 0.09 },
  { order: 7, key: 'open_tickets', weight: 0.07 },
  { order: 8, key: 'payment_delay', weight: 0.06 },
  { order: 9, key: 'missed_meetings', weight: 0.05 },
  { order: 10, key: 'nps_dissatisfaction', weight: 0.03 },
];
