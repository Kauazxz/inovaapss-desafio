/**
 * DADOS DE EXEMPLO (MOCK) da visão individual do cliente — Etapa 9.
 *
 * Nada aqui vem do banco. Reaproveita os 24 clientes e os 6 períodos de `./dashboard` (mesmos
 * ids, nomes, health, evidências e ação sugerida) e deriva, de forma determinística, o que a
 * tela do cliente precisa: os 10 scores do preset GlobalSys v1 (§71) com série por período,
 * evidências (§29), recomendações com playbook (§30) e a timeline de eventos (§40).
 *
 * Coerência com o dashboard: o health geral, o risco, a prioridade e a confiança são os mesmos
 * de `buildRankingRow`; a principal evidência do cliente aqui é a mesma `topEvidence` de lá, e a
 * primeira recomendação tem o mesmo título da `suggestedAction`. Os 10 scores são ajustados
 * para a média ponderada bater com o health geral.
 *
 * Quando a API existir (Etapas 4 + 6 + módulo client-health), `features/client-detail/api.ts`
 * troca este arquivo por `GET /clients/:id`, `/scores`, `/evidence`, `/recommendations` e
 * `/history`, e ele some. Os tipos já são os de `@inovaapss/shared`.
 */
import {
  classifyHealth,
  type ClassBand,
  type ClientEvidenceResponse,
  type ClientHealthDimension,
  type ClientHealthOverview,
  type ClientHistoryResponse,
  type ClientRecommendationsResponse,
  type ClientScoresResponse,
  type EvidenceDto,
  type HealthClass,
  type HealthTimePoint,
  type MetricDirection,
  type MetricPeriodPointDto,
  type MetricScoreDto,
  type MetricType,
  type RecommendationDto,
  type RecommendationStatus,
  type TimelineEventDto,
} from '@inovaapss/shared';

import {
  buildMockGeneralDashboard,
  buildRankingRow,
  MOCK_CLIENTS,
  MOCK_CURRENCY,
  MOCK_PERIOD_LABEL,
  MOCK_PERIODS,
  MOCK_THRESHOLDS,
  type MockClient,
} from './dashboard';

export const MOCK_MODEL_VERSION = 'GlobalSys v1';
export const MOCK_GENERATED_AT = '2026-09-19T08:00:00.000Z';

/** Trimestres das pesquisas de NPS (§22: a pesquisa é trimestral no dataset), do mais antigo ao mais recente. */
export const MOCK_NPS_QUARTERS: readonly {
  periodEnd: string;
  label: string;
  monthIndex: number;
}[] = [
  { periodEnd: '2025-12-31', label: '4º tri/25', monthIndex: -4 },
  { periodEnd: '2026-03-31', label: '1º tri/26', monthIndex: -1 },
  { periodEnd: '2026-06-30', label: '2º tri/26', monthIndex: 2 },
  { periodEnd: '2026-09-30', label: '3º tri/26', monthIndex: 5 },
];

const NA_NPS = 'não respondeu';
const NA_MEETINGS = 'sem reunião prevista no período';
const NA_NO_DATA = 'sem dado no período';
/** Distância mínima (pontos de risco) entre contribuições consecutivas na ordem forçada. */
const ORDER_MARGIN = 0.5;

// ---------- Preset GlobalSys v1 (§71) ----------

interface RawContext {
  /** Chamados abertos no período (base das taxas de críticos e reabertos). */
  open: number;
  /** SLA contratado em horas (métrica 2). */
  slaHours: number;
  sizeFactor: number;
}

export interface MockMetricDefinition {
  id: string;
  key: string;
  name: string;
  dimension: ClientHealthDimension;
  type: MetricType;
  unit: string | null;
  direction: MetricDirection;
  /** Peso do preset (§71); somam 1,00. */
  weight: number;
  /** Valor bruto ilustrativo a partir do current_health do período (inverso da normalização). */
  value: (health: number, ctx: RawContext) => number;
  /** Playbook (§30). */
  playbook: { title: string; description: string };
  /** Liga uma evidência do dashboard a esta métrica. */
  pattern: RegExp;
}

function openTicketsValue(health: number, sizeFactor: number): number {
  return Math.round(6 * sizeFactor * (1 + ((100 - health) / 100) * 0.9));
}

export const MOCK_METRIC_PRESET: readonly MockMetricDefinition[] = [
  {
    id: 'metric-critical-tickets',
    key: 'critical_tickets',
    name: 'Chamados críticos',
    dimension: 'support',
    type: 'QUANTITY',
    unit: 'chamados',
    direction: 'HIGHER_IS_WORSE',
    weight: 0.18,
    value: (health, ctx) => Math.round(ctx.open * (0.04 + ((100 - health) / 100) * 0.42)),
    playbook: {
      title: 'Abrir sala de crise com o time técnico e revisar os chamados críticos',
      description:
        'Listar os chamados críticos abertos e reincidentes, definir um responsável por cada um e combinar com o cliente uma janela diária de acompanhamento até a fila crítica zerar.',
    },
    pattern: /crítico/i,
  },
  {
    id: 'metric-resolution-vs-sla',
    key: 'resolution_vs_sla',
    name: 'Tempo de resolução vs. SLA',
    dimension: 'sla',
    type: 'TIME',
    unit: 'h',
    direction: 'HIGHER_IS_WORSE',
    weight: 0.16,
    value: (health, ctx) =>
      Math.round(ctx.slaHours * (0.35 + ((100 - health) / 100) * 1.1) * 10) / 10,
    playbook: {
      title: 'Revisar as causas de estouro de SLA com o gestor da conta',
      description:
        'Cruzar os chamados que passaram da meta operacional com severidade e tipo, identificar o gargalo (fila, escalonamento, dependência do cliente) e ajustar a meta operacional sugerida por severidade.',
    },
    pattern: /tempo de resolução/i,
  },
  {
    id: 'metric-platform-usage',
    key: 'platform_usage',
    name: 'Uso da plataforma',
    dimension: 'usage',
    type: 'PERCENTAGE',
    unit: '%',
    direction: 'HIGHER_IS_BETTER',
    weight: 0.14,
    value: (health) => Math.round(35 + health * 0.6),
    playbook: {
      title: 'Revisar a adoção da plataforma com o time do cliente',
      description:
        'Levantar quais módulos deixaram de ser usados, agendar uma sessão de adoção com os usuários-chave e definir uma meta de uso para o próximo mês.',
    },
    pattern: /\buso\b/i,
  },
  {
    id: 'metric-sla-compliance',
    key: 'sla_compliance',
    name: 'Cumprimento de SLA',
    dimension: 'sla',
    type: 'PERCENTAGE',
    unit: '%',
    direction: 'HIGHER_IS_BETTER',
    weight: 0.12,
    value: (health) => Math.round(55 + health * 0.44),
    playbook: {
      title: 'Revisar as causas de estouro de SLA com o gestor da conta',
      description:
        'Separar os chamados fora do SLA por severidade, verificar se a política de SLA do plano está correta e combinar um plano de recuperação do índice com o cliente.',
    },
    pattern: /\bsla\b/i,
  },
  {
    id: 'metric-reopened-tickets',
    key: 'reopened_tickets',
    name: 'Chamados reabertos',
    dimension: 'support',
    type: 'QUANTITY',
    unit: 'chamados',
    direction: 'HIGHER_IS_WORSE',
    weight: 0.1,
    value: (health, ctx) => Math.round(ctx.open * (0.02 + ((100 - health) / 100) * 0.3)),
    playbook: {
      title: 'Análise de causa raiz dos chamados reabertos',
      description:
        'Revisar os chamados reabertos no período, classificar o motivo (solução parcial, comunicação, regressão) e tratar a causa mais frequente antes do próximo ciclo.',
    },
    pattern: /reabert/i,
  },
  {
    id: 'metric-formal-complaints',
    key: 'formal_complaints',
    name: 'Reclamações formais',
    dimension: 'support',
    type: 'QUANTITY',
    unit: 'reclamações',
    direction: 'HIGHER_IS_WORSE',
    weight: 0.09,
    value: (health) => (health >= 85 ? 0 : health >= 60 ? 1 : health >= 35 ? 2 : 3),
    playbook: {
      title: 'Contato de relacionamento para tratar as reclamações',
      description:
        'Responder cada reclamação formal com um plano de ação por escrito e um responsável, e confirmar com o cliente o fechamento de cada uma.',
    },
    pattern: /reclama/i,
  },
  {
    id: 'metric-open-tickets',
    key: 'open_tickets',
    name: 'Chamados abertos',
    dimension: 'support',
    type: 'QUANTITY',
    unit: 'chamados',
    direction: 'HIGHER_IS_WORSE',
    weight: 0.07,
    value: (health, ctx) => openTicketsValue(health, ctx.sizeFactor),
    playbook: {
      title: 'Revisar a fila de chamados abertos com o suporte',
      description:
        'Priorizar a fila pelo SLA restante, fechar os chamados parados aguardando o cliente e alinhar a capacidade do time ao volume do cliente.',
    },
    pattern: /abertos/i,
  },
  {
    id: 'metric-payment-delay',
    key: 'payment_delay',
    name: 'Atraso de pagamento',
    dimension: 'financial',
    type: 'TIME',
    unit: 'dias',
    direction: 'HIGHER_IS_WORSE',
    weight: 0.06,
    value: (health) => (health >= 90 ? 0 : Math.round(((100 - health) / 100) * 55)),
    playbook: {
      title: 'Acionar o financeiro e alinhar o plano de regularização',
      description:
        'Confirmar com o financeiro do cliente se há contestação de fatura, negociar a regularização e registrar a data combinada para acompanhar no próximo mês.',
    },
    pattern: /pagamento/i,
  },
  {
    id: 'metric-missed-meetings',
    key: 'missed_meetings',
    name: 'Reuniões não realizadas',
    dimension: 'meetings',
    type: 'PERCENTAGE',
    unit: '%',
    direction: 'HIGHER_IS_WORSE',
    weight: 0.05,
    value: (health) => (health >= 80 ? 0 : health >= 50 ? 50 : 100),
    playbook: {
      title: 'Reagendar o acompanhamento mensal com o patrocinador',
      description:
        'Reagendar a reunião de acompanhamento com o patrocinador do cliente, levar a pauta com os indicadores desta tela e registrar os compromissos combinados.',
    },
    pattern: /reuni/i,
  },
  {
    id: 'metric-nps',
    key: 'nps_dissatisfaction',
    name: 'NPS',
    dimension: 'nps',
    type: 'SCORE',
    unit: 'pontos',
    direction: 'HIGHER_IS_BETTER',
    weight: 0.03,
    value: (health) => Math.min(10, Math.max(0, Math.round(health / 10))),
    playbook: {
      title: 'Contato de relacionamento para entender a queda do NPS',
      description:
        'Ligar para quem respondeu a pesquisa, entender o motivo da nota e devolver ao cliente o que será feito a partir do retorno dele.',
    },
    pattern: /\bnps\b/i,
  },
];

// ---------- Utilidades determinísticas ----------

function hash(text: string): number {
  let value = 5381;
  for (let index = 0; index < text.length; index += 1) {
    value = ((value << 5) + value + text.charCodeAt(index)) >>> 0;
  }
  return value;
}

/** Número estável em [0, 1) a partir de uma chave — o mock não pode mudar entre renderizações. */
function unit(key: string): number {
  return (hash(key) % 10_000) / 10_000;
}

function jitter(key: string, amplitude: number): number {
  return (unit(key) * 2 - 1) * amplitude;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 0): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Número em pt-BR sem `Intl` (o motor faz igual): `12,5`. */
function fmt(value: number, digits = 0): string {
  return value.toFixed(digits).replace('.', ',');
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

const HEALTH_BANDS: readonly ClassBand<HealthClass>[] = [
  { class: 'NORMAL', min: MOCK_THRESHOLDS.attention },
  { class: 'ATTENTION', min: MOCK_THRESHOLDS.risk },
  { class: 'RISK', min: MOCK_THRESHOLDS.critical },
  { class: 'CRITICAL', min: 0 },
];

function classify(health: number): HealthClass {
  return classifyHealth(health, HEALTH_BANDS);
}

const SIZE_FACTOR: Readonly<Record<string, number>> = { Pequeno: 1, Médio: 2, Grande: 3.5 };
const SLA_HOURS_BY_PLAN: Readonly<Record<string, number>> = {
  Enterprise: 8,
  Business: 24,
  Essencial: 48,
};

function findClient(clientId: string): MockClient | undefined {
  return MOCK_CLIENTS.find((client) => client.id === clientId);
}

/** overall_health do cliente no período `index` (histórico alinhado à direita); `null` se não existia. */
function healthAtPeriod(client: MockClient, index: number): number | null {
  const offset = MOCK_PERIODS.length - client.history.length;
  if (index < offset) return null;
  if (client.cancelledAtPeriod !== undefined && index > client.cancelledAtPeriod) return null;
  return client.history[index - offset] ?? null;
}

function lastHealth(client: MockClient): number {
  return client.history[client.history.length - 1] ?? 0;
}

function dimensionHealth(client: MockClient, dimension: ClientHealthDimension): number | null {
  const index = ['support', 'sla', 'usage', 'nps', 'financial', 'meetings'].indexOf(dimension);
  return client.dimensions[index] ?? null;
}

// ---------- Scores por métrica ----------

interface EvidenceLink {
  key: string;
  text: string;
  /** Texto que descreve melhora ("recuperou", "subiu") — não vira driver forçado. */
  positive: boolean;
}

/** Liga cada evidência do dashboard à métrica que ela descreve (para o texto ser o mesmo). */
function linkEvidences(client: MockClient): EvidenceLink[] {
  const links: EvidenceLink[] = [];
  for (const text of client.evidences) {
    const def = MOCK_METRIC_PRESET.find((metric) => metric.pattern.test(text));
    if (!def || links.some((link) => link.key === def.key)) continue;
    links.push({ key: def.key, text, positive: /recuperou|subiu|melhorou/i.test(text) });
  }
  return links;
}

interface MetricHealths {
  /** metric_health final por métrica (`null` = N/A). */
  final: Map<string, number | null>;
  /** Peso normalizado entre as disponíveis. */
  normalizedWeight: Map<string, number>;
  links: EvidenceLink[];
}

/**
 * Health de cada métrica no período atual: parte da saúde da dimensão (com um ruído estável),
 * força a ordem das evidências do dashboard (a primeira evidência é o driver de maior
 * contribuição) e ajusta tudo para a média ponderada bater com o health geral do cliente.
 */
function computeMetricHealths(client: MockClient): MetricHealths {
  const target = lastHealth(client);
  const links = linkEvidences(client);
  const base = new Map<string, number | null>();

  for (const def of MOCK_METRIC_PRESET) {
    const dimension = dimensionHealth(client, def.dimension);
    if (dimension === null) {
      base.set(def.key, null);
      continue;
    }
    const link = links.find((item) => item.key === def.key);
    if (link?.positive) {
      base.set(def.key, clamp(85 + jitter(`${client.id}:${def.key}`, 6)));
      continue;
    }
    base.set(def.key, clamp(dimension + jitter(`${client.id}:${def.key}`, 8)));
  }

  const available = MOCK_METRIC_PRESET.filter((def) => base.get(def.key) !== null);
  const totalWeight = available.reduce((sum, def) => sum + def.weight, 0);
  const normalizedWeight = new Map<string, number>();
  for (const def of MOCK_METRIC_PRESET) {
    const isAvailable = available.includes(def);
    normalizedWeight.set(def.key, isAvailable && totalWeight > 0 ? def.weight / totalWeight : 0);
  }
  const contributionOf = (key: string, health: number) =>
    (normalizedWeight.get(key) ?? 0) * (100 - health);

  // Duas restrições: (1) a ordem das evidências do dashboard — evidência 1 é o driver de maior
  // contribuição, depois a 2, e só então as outras métricas; (2) a média ponderada é o health
  // geral do dashboard. As métricas com evidência recebem o health que a ordem exige; as outras
  // partem da preferência da dimensão e descem (ou sobem) todas pelo mesmo deslocamento, sem
  // passar do piso que a ordem permite, até fechar a média. Quando as duas não cabem juntas
  // (evidência de peso baixo num cliente muito crítico), a média prevalece: é o mesmo número nas
  // duas telas.
  const forced = links.filter((link) => !link.positive && base.get(link.key) !== null);
  const forcedKeys = new Set(forced.map((link) => link.key));
  const others = available.filter((def) => !forcedKeys.has(def.key));
  const final = new Map(base);
  const weightOf = (key: string) => normalizedWeight.get(key) ?? 0;
  const baseOf = (key: string) => base.get(key) ?? 100;

  // (1) Da última evidência para a primeira, cada uma acima da seguinte e das demais métricas;
  // depois, de cima para baixo, quem não conseguiu subir o suficiente puxa as seguintes para baixo.
  let nextContribution = others.reduce(
    (max, def) => Math.max(max, contributionOf(def.key, baseOf(def.key))),
    0,
  );
  for (let index = forced.length - 1; index >= 0; index -= 1) {
    const link = forced[index]!;
    const weight = weightOf(link.key);
    const desired = nextContribution + ORDER_MARGIN;
    const health =
      weight > 0 ? clamp(Math.min(baseOf(link.key), 100 - desired / weight)) : baseOf(link.key);
    final.set(link.key, health);
    nextContribution = contributionOf(link.key, health);
  }
  for (let index = 1; index < forced.length; index += 1) {
    const previous = forced[index - 1]!;
    const link = forced[index]!;
    const cap = contributionOf(previous.key, final.get(previous.key) ?? 100) - ORDER_MARGIN;
    if (contributionOf(link.key, final.get(link.key) ?? 100) <= cap) continue;
    const weight = weightOf(link.key);
    final.set(link.key, cap <= 0 || weight <= 0 ? 100 : clamp(100 - cap / weight));
  }
  const last = forced[forced.length - 1];
  const floor = last ? contributionOf(last.key, final.get(last.key) ?? 100) : null;
  const lowerBound = (key: string) =>
    floor === null || weightOf(key) <= 0
      ? 0
      : clamp(100 - Math.max(0, floor - ORDER_MARGIN) / weightOf(key));

  // (2) Deslocamento comum `shift` das outras métricas (positivo = desce), por bissecção.
  const forcedSum = forced.reduce(
    (sum, link) => sum + weightOf(link.key) * (final.get(link.key) ?? 0),
    0,
  );
  const othersAt = (shift: number, respectOrder: boolean) =>
    others.reduce((sum, def) => {
      const low = respectOrder ? lowerBound(def.key) : 0;
      return sum + weightOf(def.key) * clamp(Math.max(low, baseOf(def.key) - shift));
    }, 0);
  const solveShift = (respectOrder: boolean): number | null => {
    const need = target - forcedSum;
    if (need > othersAt(-100, respectOrder) + 0.01 || need < othersAt(100, respectOrder) - 0.01)
      return null;
    let low = -100;
    let high = 100;
    for (let step = 0; step < 40; step += 1) {
      const middle = (low + high) / 2;
      if (othersAt(middle, respectOrder) > need) low = middle;
      else high = middle;
    }
    return (low + high) / 2;
  };

  const ordered = solveShift(true);
  const shift = ordered ?? solveShift(false);
  if (shift !== null && others.length > 0) {
    for (const def of others) {
      const low = ordered !== null ? lowerBound(def.key) : 0;
      final.set(def.key, clamp(Math.max(low, baseOf(def.key) - shift)));
    }
  } else {
    // Nem com as outras métricas no extremo a média fecha: todas partem da dimensão e descem
    // (ou sobem) juntas — a ordem das evidências fica como o dado permitir.
    const allAt = (value: number) =>
      available.reduce((sum, def) => sum + weightOf(def.key) * clamp(baseOf(def.key) - value), 0);
    let low = -100;
    let high = 100;
    for (let step = 0; step < 40; step += 1) {
      const middle = (low + high) / 2;
      if (allAt(middle) > target) low = middle;
      else high = middle;
    }
    for (const def of available) final.set(def.key, clamp(baseOf(def.key) - (low + high) / 2));
  }
  for (const [key, health] of final) {
    if (health !== null) final.set(key, round(health, 1));
  }
  return { final, normalizedWeight, links };
}

/** current_health da métrica em cada período mensal: acompanha o histórico do health geral. */
function metricHealthSeries(
  client: MockClient,
  key: string,
  latest: number | null,
): (number | null)[] {
  const target = lastHealth(client);
  return MOCK_PERIODS.map((_, index) => {
    const overall = healthAtPeriod(client, index);
    if (overall === null || latest === null) return null;
    const ratio = target > 0 ? overall / target : 1;
    return round(clamp(latest * ratio + jitter(`${client.id}:${key}:${index}`, 3)), 1);
  });
}

/** Baseline do próprio cliente: média dos até 3 períodos anteriores com dado (§9). */
function rollingBaseline(values: readonly (number | null)[], index: number): number | null {
  const previous = values
    .slice(Math.max(0, index - 3), index)
    .filter((value): value is number => value !== null);
  const value = mean(previous);
  return value === null ? null : round(value, 1);
}

interface ClientMetricSeries {
  def: MockMetricDefinition;
  health: number | null;
  points: MetricPeriodPointDto[];
}

function buildMonthlyPoints(
  client: MockClient,
  def: MockMetricDefinition,
  latest: number | null,
  openHealths: (number | null)[],
): MetricPeriodPointDto[] {
  const healths = metricHealthSeries(client, def.key, latest);
  const sizeFactor = SIZE_FACTOR[client.size] ?? 1;
  const slaHours = SLA_HOURS_BY_PLAN[client.plan] ?? 24;
  const naReason = def.dimension === 'meetings' ? NA_MEETINGS : NA_NO_DATA;

  const values = healths.map((health, index) => {
    if (health === null) return null;
    if (def.key === 'missed_meetings') return def.value(health, { open: 0, slaHours, sizeFactor });
    const open = openTicketsValue(openHealths[index] ?? 50, sizeFactor);
    return def.value(health, { open, slaHours, sizeFactor });
  });

  return MOCK_PERIODS.map((period, index): MetricPeriodPointDto => {
    const health = healths[index] ?? null;
    const value = values[index] ?? null;
    const point: MetricPeriodPointDto = {
      periodEnd: period.periodEnd,
      label: period.label,
      value,
      health,
      baseline: rollingBaseline(values, index),
      portfolioValue: null,
      naReason:
        value === null ? (healthAtPeriod(client, index) === null ? NA_NO_DATA : naReason) : null,
    };
    if (def.key === 'missed_meetings') {
      const planned = value === null ? 0 : client.size === 'Grande' ? 2 : 1;
      const completed = value === null ? 0 : Math.round(planned * (1 - value / 100));
      point.extra = { planned, completed };
    }
    return point;
  });
}

function npsClassification(score: number): string {
  if (score >= 9) return 'Promotor';
  if (score >= 7) return 'Neutro';
  return 'Detrator';
}

/** Série trimestral do NPS: "não respondeu" é um estado, nunca zero (§22). */
function buildNpsPoints(client: MockClient, latest: number | null): MetricPeriodPointDto[] {
  const target = lastHealth(client);
  return MOCK_NPS_QUARTERS.map((quarter, index): MetricPeriodPointDto => {
    const monthIndex = Math.max(0, quarter.monthIndex);
    const overall =
      quarter.monthIndex < 0
        ? (client.history[0] ?? null)
        : healthAtPeriod(client, Math.min(monthIndex, MOCK_PERIODS.length - 1));
    const isLast = index === MOCK_NPS_QUARTERS.length - 1;
    const skipped = unit(`${client.id}:nps:${quarter.periodEnd}`) < 0.3;
    const answered = latest !== null && overall !== null && (isLast || !skipped);
    if (!answered) {
      return {
        periodEnd: quarter.periodEnd,
        label: quarter.label,
        value: null,
        health: null,
        baseline: null,
        portfolioValue: null,
        naReason: NA_NPS,
        extra: { answered: false, classification: null },
      };
    }
    const health = clamp(latest * (target > 0 ? overall / target : 1));
    const score = Math.min(10, Math.max(0, Math.round(health / 10)));
    return {
      periodEnd: quarter.periodEnd,
      label: quarter.label,
      value: score,
      health: score * 10,
      baseline: null,
      portfolioValue: null,
      naReason: null,
      extra: { answered: true, classification: npsClassification(score) },
    };
  });
}

function buildClientMetricSeries(client: MockClient, healths: MetricHealths): ClientMetricSeries[] {
  const openHealths = metricHealthSeries(
    client,
    'open_tickets',
    healths.final.get('open_tickets') ?? null,
  );
  return MOCK_METRIC_PRESET.map((def) => {
    const latest = healths.final.get(def.key) ?? null;
    const points =
      def.key === 'nps_dissatisfaction'
        ? buildNpsPoints(client, latest)
        : buildMonthlyPoints(client, def, latest, openHealths);
    return { def, health: latest, points };
  });
}

/** Média da carteira (clientes ativos) de cada métrica por período — a linha cinza das abas. */
let portfolioCache: Map<string, (number | null)[]> | null = null;
function portfolioAverages(): Map<string, (number | null)[]> {
  if (portfolioCache) return portfolioCache;
  const all = MOCK_CLIENTS.filter((client) => client.status === 'Ativo').map((client) =>
    buildClientMetricSeries(client, computeMetricHealths(client)),
  );
  const cache = new Map<string, (number | null)[]>();
  for (const def of MOCK_METRIC_PRESET) {
    const length =
      def.key === 'nps_dissatisfaction' ? MOCK_NPS_QUARTERS.length : MOCK_PERIODS.length;
    const averages: (number | null)[] = [];
    for (let index = 0; index < length; index += 1) {
      const values = all
        .map(
          (series) => series.find((item) => item.def.key === def.key)?.points[index]?.value ?? null,
        )
        .filter((value): value is number => value !== null);
      const average = mean(values);
      averages.push(average === null ? null : round(average, 1));
    }
    cache.set(def.key, averages);
  }
  portfolioCache = cache;
  return cache;
}

function pluralName(name: string): boolean {
  return /[a-záéíóúâêôãõç]s$/.test(name.trim());
}

/** Explicação em português no estilo do motor (`explainMetric`), a partir da série. */
function describeMetric(
  def: MockMetricDefinition,
  points: readonly MetricPeriodPointDto[],
  slaHours: number,
): string {
  const name = def.name;
  const last = points[points.length - 1];
  const withData = points.filter((point) => point.value !== null);
  const window = withData.slice(-3);
  const latest = window[window.length - 1];
  const first = window[0];

  if (def.key === 'nps_dissatisfaction') {
    if (!last || last.value === null) return 'NPS: não respondeu na última pesquisa.';
    const previous = withData[withData.length - 2];
    const was = previous && previous.value !== null ? ` (era ${previous.value})` : '';
    return `NPS ${last.value}${was} — ${npsClassification(last.value)}.`;
  }
  if (def.key === 'missed_meetings') {
    if (!last || last.value === null) return `Reuniões: N/A — ${NA_MEETINGS}.`;
    const planned = Number(last.extra?.['planned'] ?? 0);
    const completed = Number(last.extra?.['completed'] ?? 0);
    const missed = planned - completed;
    if (missed <= 0) return `Todas as ${planned} reuniões previstas ocorreram no mês.`;
    return `${missed} de ${planned} reuniões previstas não ocorreram.`;
  }
  if (!latest || latest.value === null || !first || first.value === null) {
    return `${name}: N/A — ${last?.naReason ?? NA_NO_DATA}.`;
  }
  const n = window.length;
  const span = n >= 2 ? ` em ${n} ${n === 1 ? 'mês' : 'meses'}` : '';
  const value = latest.value;

  if (def.unit === '%') {
    const delta = value - first.value;
    if (n < 2 || Math.abs(delta) < 1)
      return `${name} está estável em ${fmt(value)} %${n >= 2 ? ` há ${n} meses` : ''}.`;
    return `${name} ${delta < 0 ? 'caiu' : 'subiu'} ${fmt(Math.abs(delta))} p.p.${span}.`;
  }
  if (def.unit === 'h') {
    return `${name} está em ${fmt(value, 1)} h — ${fmt(value / slaHours, 1)}× o SLA contratado de ${slaHours} h.`;
  }
  if (def.unit === 'dias') {
    if (value === 0) return 'Pagamento em dia no período.';
    const streak = [...withData].reverse().findIndex((point) => (point.value ?? 0) === 0);
    const months = streak === -1 ? withData.length : streak;
    return `Atraso de pagamento de ${value} dias${months >= 2 ? `, ${months} meses seguidos` : ' no mês'}.`;
  }
  const plural = pluralName(name);
  if (n < 2 || value === first.value) {
    return `${name} ${plural ? 'estão estáveis' : 'está estável'} em ${value} ${def.unit ?? ''}${n >= 2 ? ` há ${n} meses` : ''}.`.replace(
      '  ',
      ' ',
    );
  }
  const rose = value > first.value;
  const pct =
    first.value > 0
      ? ` (${rose ? '+' : '−'}${fmt(Math.abs(((value - first.value) / first.value) * 100))} %)`
      : '';
  const verb = plural ? (rose ? 'subiram' : 'caíram') : rose ? 'subiu' : 'caiu';
  return `${name} ${verb} de ${first.value} para ${value} ${def.unit ?? ''}${span}${pct}.`.replace(
    '  ',
    ' ',
  );
}

function rawTrend(
  current: number | null,
  previous: number | null,
): 'up' | 'down' | 'stable' | null {
  if (current === null || previous === null) return null;
  if (current > previous) return 'up';
  if (current < previous) return 'down';
  return 'stable';
}

function buildMetricScores(client: MockClient): MetricScoreDto[] {
  const healths = computeMetricHealths(client);
  const series = buildClientMetricSeries(client, healths);
  const portfolio = portfolioAverages();
  const slaHours = SLA_HOURS_BY_PLAN[client.plan] ?? 24;
  const lastPeriod = MOCK_PERIODS[MOCK_PERIODS.length - 1]!;

  return series.map(({ def, health, points }): MetricScoreDto => {
    const averages = portfolio.get(def.key) ?? [];
    const withPortfolio = points.map((point, index) => ({
      ...point,
      portfolioValue: averages[index] ?? null,
    }));
    const withData = withPortfolio.filter((point) => point.value !== null);
    const current = withPortfolio[withPortfolio.length - 1] ?? null;
    const previous = withData.length >= 2 ? withData[withData.length - 2] : null;
    const currentValue = current?.value ?? null;
    const previousValue = previous?.value ?? null;
    const link = healths.links.find((item) => item.key === def.key);
    const normalizedWeight = healths.normalizedWeight.get(def.key) ?? 0;
    const contribution = health === null ? 0 : round(normalizedWeight * (100 - health), 1);

    // Tendência e persistência ilustrativas sobre a série de health (§10, §11).
    const healthWindow = withPortfolio
      .slice(-3)
      .map((point) => point.health)
      .filter((value): value is number => value !== null);
    const trendHealth =
      health !== null && healthWindow.length >= 2
        ? round(
            clamp(
              health +
                ((healthWindow[healthWindow.length - 1] ?? health) - (healthWindow[0] ?? health)) *
                  0.6,
            ),
            1,
          )
        : null;
    const persistenceHealth =
      health !== null && healthWindow.length >= 2
        ? round(
            100 *
              (1 -
                healthWindow.filter((value) => value < MOCK_THRESHOLDS.risk).length /
                  healthWindow.length),
            1,
          )
        : null;
    const confidence =
      health === null
        ? 0
        : Math.round(
            (0.45 + (trendHealth === null ? 0 : 0.35) + (persistenceHealth === null ? 0 : 0.2)) *
              100,
          );

    const naReason = health === null ? (current?.naReason ?? NA_NO_DATA) : null;
    const summary =
      link && !link.positive
        ? link.text.endsWith('.')
          ? link.text
          : `${link.text}.`
        : link?.positive
          ? `${link.text}.`
          : describeMetric(def, withPortfolio, slaHours);

    const components =
      health === null
        ? []
        : [
            `Atual: ${fmt(health)} (peso 45 %)`,
            trendHealth === null
              ? 'Tendência: N/A — histórico insuficiente'
              : `Tendência: ${fmt(trendHealth)} (peso 35 %)`,
            persistenceHealth === null
              ? 'Persistência: N/A — histórico insuficiente'
              : `Persistência: ${fmt(persistenceHealth)} (peso 20 %)`,
          ];
    const notes: string[] = [];
    if (health === null)
      notes.push(
        `Métrica fora do cálculo: ${naReason}. O peso foi redistribuído e a confiança caiu.`,
      );
    else if (confidence < 100)
      notes.push(`Confiança da métrica em ${confidence} %: componentes sem histórico suficiente.`);

    return {
      metricId: def.id,
      metricKey: def.key,
      metricName: def.name,
      dimension: def.dimension,
      type: def.type,
      unit: def.unit,
      direction: def.direction,
      weight: def.weight,
      normalizedWeight: round(normalizedWeight, 4),
      metricHealth: health,
      currentHealth: health,
      trendHealth,
      persistenceHealth,
      confidence,
      healthClass: health === null ? null : classify(health),
      contribution,
      currentValue,
      previousValue,
      baselineValue: current?.baseline ?? null,
      delta:
        currentValue !== null && previousValue !== null
          ? round(currentValue - previousValue, 2)
          : null,
      trend: rawTrend(currentValue, previousValue),
      periodEnd:
        def.key === 'nps_dissatisfaction' ? (current?.periodEnd ?? null) : lastPeriod.periodEnd,
      naReason,
      explanation: { summary, components, notes },
      series: withPortfolio,
    };
  });
}

/** Evidências (§29) ordenadas por contribuição; métricas N/A no fim com contribuição zero. */
function buildEvidenceFromScores(scores: readonly MetricScoreDto[]): EvidenceDto[] {
  return [...scores]
    .sort((a, b) => {
      if (b.contribution !== a.contribution) return b.contribution - a.contribution;
      const aHealth = a.metricHealth ?? Number.POSITIVE_INFINITY;
      const bHealth = b.metricHealth ?? Number.POSITIVE_INFINITY;
      if (aHealth !== bHealth) return aHealth - bHealth;
      return b.weight - a.weight;
    })
    .map((score, index): EvidenceDto => ({
      metricId: score.metricId,
      metricName: score.metricName,
      currentValue: score.currentValue,
      baselineValue: score.baselineValue,
      delta: score.delta,
      trend: score.trend,
      healthScore: score.metricHealth,
      weight: score.normalizedWeight,
      contribution: score.contribution,
      humanExplanation: score.explanation.summary,
      isNegative: score.metricHealth !== null && score.contribution > 0 && score.metricHealth < 100,
      metricKey: score.metricKey,
      dimension: score.dimension,
      unit: score.unit,
      rank: index + 1,
    }));
}

// ---------- Cabeçalho e resumo (GET /clients/:id) ----------

function contractOf(client: MockClient): ClientHealthOverview['contract'] {
  const seed = hash(client.id);
  const startYear = 2023 + (seed % 3);
  const startMonth = String((seed % 12) + 1).padStart(2, '0');
  const cancelled =
    client.cancelledAtPeriod !== undefined ? MOCK_PERIODS[client.cancelledAtPeriod] : undefined;
  return {
    id: `contract-${client.id}`,
    code: `CT-${startYear}-${String(seed % 900).padStart(3, '0')}`,
    startDate: `${startYear}-${startMonth}-01`,
    endDate: cancelled ? cancelled.periodEnd : null,
    status: cancelled ? 'Encerrado' : 'Vigente',
    monthlyValue: client.mrr,
    currency: MOCK_CURRENCY,
    contractedSlaHours: SLA_HOURS_BY_PLAN[client.plan] ?? null,
  };
}

function timePoints(client: MockClient): HealthTimePoint[] {
  return MOCK_PERIODS.map((period, index) => ({
    periodEnd: period.periodEnd,
    label: period.label,
    health: healthAtPeriod(client, index),
  }));
}

/** O que `GET /clients/:id` devolverá, calculado sobre o mock. `null` = cliente inexistente (404). */
export function buildMockClientOverview(clientId: string): ClientHealthOverview | null {
  const client = findClient(clientId);
  if (!client) return null;
  const row = buildRankingRow(client);
  const scores = buildMetricScores(client);
  const evidence = buildEvidenceFromScores(scores);
  const previous =
    client.history.length >= 2 ? (client.history[client.history.length - 2] ?? null) : null;
  const cancelled =
    client.cancelledAtPeriod !== undefined ? MOCK_PERIODS[client.cancelledAtPeriod] : undefined;

  return {
    client: {
      id: client.id,
      name: client.name,
      externalCode: `CLI-${String(hash(client.id) % 1000).padStart(4, '0')}`,
      segment: client.segment,
      size: client.size,
      status: client.status,
      cancelledAt: cancelled ? cancelled.periodEnd : null,
      strategicImportance: client.commercialImpact,
    },
    plan: { id: `plan-${client.plan.toLowerCase()}`, name: client.plan },
    contract: contractOf(client),
    mrr: client.mrr,
    currency: MOCK_CURRENCY,
    score: {
      periodEnd: row.periodEnd,
      modelVersion: MOCK_MODEL_VERSION,
      overallHealth: row.healthCurrent,
      healthClass: row.currentClass,
      previousHealth: previous,
      trend: row.trend,
      riskScore: row.riskScore,
      analysisConfidence: row.confidence,
      commercialImpactScore: client.commercialImpact,
      priorityScore: row.priorityScore,
      priorityClass: row.priorityClass,
      priorityFloor: null,
      healthProjected: row.healthProjected,
      projectedClass: row.projectedClass,
      projectionConfidence: row.projectionConfidence,
      metricsAvailable: scores.filter((score) => score.metricHealth !== null).length,
      metricsTotal: scores.length,
    },
    thresholds: MOCK_THRESHOLDS,
    periodLabel: MOCK_PERIOD_LABEL,
    topDrivers: evidence.filter((driver) => driver.isNegative).slice(0, 4),
    healthHistory: timePoints(client),
    portfolioHistory: buildMockGeneralDashboard().timeline.portfolio,
    generatedAt: MOCK_GENERATED_AT,
  };
}

/** O que `GET /clients/:id/scores` devolverá. */
export function buildMockClientScores(clientId: string): ClientScoresResponse | null {
  const client = findClient(clientId);
  if (!client) return null;
  return {
    clientId,
    periodEnd: MOCK_PERIODS[MOCK_PERIODS.length - 1]!.periodEnd,
    modelVersion: MOCK_MODEL_VERSION,
    items: buildMetricScores(client),
  };
}

/** O que `GET /clients/:id/evidence` devolverá. */
export function buildMockClientEvidence(clientId: string): ClientEvidenceResponse | null {
  const client = findClient(clientId);
  if (!client) return null;
  return {
    clientId,
    periodEnd: MOCK_PERIODS[MOCK_PERIODS.length - 1]!.periodEnd,
    items: buildEvidenceFromScores(buildMetricScores(client)),
  };
}

// ---------- Recomendações (GET /clients/:id/recommendations) ----------

function dateAfter(periodEnd: string, days: number): string {
  const date = new Date(`${periodEnd}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

/** Recomendação concluída num período anterior, para clientes com histórico (alimenta a timeline). */
function completedRecommendation(
  client: MockClient,
  scores: readonly MetricScoreDto[],
): RecommendationDto | null {
  if (client.history.length < 4 || unit(`${client.id}:done`) < 0.4) return null;
  const candidates = scores.filter(
    (score) => score.metricHealth !== null && score.metricHealth < 80,
  );
  const score =
    candidates[Math.floor(unit(`${client.id}:done-pick`) * candidates.length)] ?? candidates[0];
  if (!score) return null;
  const def = MOCK_METRIC_PRESET.find((metric) => metric.key === score.metricKey)!;
  const createdPeriod = MOCK_PERIODS[Math.max(0, MOCK_PERIODS.length - 4)]!;
  const donePeriod = MOCK_PERIODS[Math.max(0, MOCK_PERIODS.length - 3)]!;
  return {
    id: `${client.id}-rec-done`,
    recommendationId: `playbook-${def.key}`,
    metricId: def.id,
    metricName: def.name,
    dimension: def.dimension,
    triggerType: 'METRIC_HEALTH',
    title: def.playbook.title,
    description: def.playbook.description,
    priority: 1,
    status: 'DONE',
    evidence: `${def.name} abaixo de 60 em ${createdPeriod.label}`,
    alertId: null,
    createdAt: dateAfter(createdPeriod.periodEnd, 2),
    completedAt: dateAfter(donePeriod.periodEnd, -6),
  };
}

/** O que `GET /clients/:id/recommendations` devolverá: abertas primeiro, por prioridade. */
export function buildMockClientRecommendations(
  clientId: string,
): ClientRecommendationsResponse | null {
  const client = findClient(clientId);
  if (!client) return null;
  const scores = buildMetricScores(client);
  const evidence = buildEvidenceFromScores(scores);
  const lastPeriod = MOCK_PERIODS[MOCK_PERIODS.length - 1]!;
  const items: RecommendationDto[] = [];

  const drivers = evidence.filter(
    (driver) =>
      driver.isNegative && driver.healthScore !== null && driver.healthScore < MOCK_THRESHOLDS.risk,
  );
  drivers.slice(0, 5).forEach((driver, index) => {
    const def = MOCK_METRIC_PRESET.find((metric) => metric.key === driver.metricKey)!;
    const statuses: RecommendationStatus[] = ['PENDING', 'IN_PROGRESS'];
    const status =
      index === 0
        ? 'PENDING'
        : (statuses[Math.floor(unit(`${client.id}:${def.key}:status`) * statuses.length)] ??
          'PENDING');
    items.push({
      id: `${client.id}-rec-${index + 1}`,
      recommendationId: `playbook-${def.key}`,
      metricId: def.id,
      metricName: def.name,
      dimension: def.dimension,
      triggerType:
        driver.healthScore !== null && driver.healthScore < 25
          ? 'CRITICAL_TRIGGER'
          : 'METRIC_HEALTH',
      // A primeira recomendação é a mesma "ação sugerida" do dashboard.
      title: index === 0 ? client.suggestedAction : def.playbook.title,
      description: def.playbook.description,
      priority: index + 1,
      status,
      evidence: driver.humanExplanation,
      alertId:
        driver.healthScore !== null && driver.healthScore < 25
          ? `${client.id}-alert-${def.key}`
          : null,
      createdAt: dateAfter(lastPeriod.periodEnd, 1),
      completedAt: null,
    });
  });

  if (items.length === 0) {
    items.push({
      id: `${client.id}-rec-routine`,
      recommendationId: 'playbook-routine',
      metricId: null,
      metricName: null,
      dimension: null,
      triggerType: 'METRIC_HEALTH',
      title: client.suggestedAction,
      description:
        client.status === 'Cancelado'
          ? 'Registrar no cadastro o motivo informado pelo cliente e a data; o backtest usa este histórico para calibrar os pesos (§33).'
          : 'Manter a cadência de acompanhamento e conferir esta tela a cada novo período importado; nenhuma métrica pede ação imediata.',
      priority: 1,
      status: 'PENDING',
      evidence: evidence[0]?.humanExplanation ?? null,
      alertId: null,
      createdAt: dateAfter(lastPeriod.periodEnd, 1),
      completedAt: null,
    });
  }

  const done = completedRecommendation(client, scores);
  if (done) items.push(done);
  return { clientId, items };
}

// ---------- Histórico e timeline (GET /clients/:id/history) ----------

/** O que `GET /clients/:id/history` devolverá: linha do health + eventos do mais recente ao mais antigo. */
export function buildMockClientHistory(clientId: string): ClientHistoryResponse | null {
  const client = findClient(clientId);
  if (!client) return null;
  const scores = buildMetricScores(client);
  const events: TimelineEventDto[] = [];
  let counter = 0;
  const push = (event: Omit<TimelineEventDto, 'id'>) => {
    counter += 1;
    events.push({ id: `${client.id}-event-${counter}`, ...event });
  };
  const contract = contractOf(client);
  const firstIndex = MOCK_PERIODS.findIndex((_, index) => healthAtPeriod(client, index) !== null);
  const firstPeriod = MOCK_PERIODS[Math.max(0, firstIndex)]!;

  push({
    type: 'CONTRACT',
    severity: 'INFO',
    occurredAt: `${contract!.startDate}T12:00:00.000Z`,
    periodEnd: null,
    title: `Contrato ${contract!.code} iniciado`,
    description: `Plano ${client.plan} · ${MOCK_CURRENCY} ${client.mrr.toLocaleString('pt-BR')}/mês · SLA contratado de ${contract!.contractedSlaHours} h`,
    healthAt: null,
    fromClass: null,
    toClass: null,
    metricId: null,
    metricName: null,
  });
  push({
    type: 'MODEL_VERSION',
    severity: 'INFO',
    occurredAt: dateAfter(firstPeriod.periodEnd, -20),
    periodEnd: firstPeriod.periodEnd,
    title: `${MOCK_MODEL_VERSION} ativado`,
    description:
      '10 métricas com os pesos iniciais do preset (§71); primeiro cálculo deste cliente.',
    healthAt: healthAtPeriod(client, Math.max(0, firstIndex)),
    fromClass: null,
    toClass: null,
    metricId: null,
    metricName: null,
  });

  let previousClass: HealthClass | null = null;
  const critical = scores.find((score) => score.metricKey === 'critical_tickets');
  const payment = scores.find((score) => score.metricKey === 'payment_delay');
  let criticalAlertActive = false;
  let paymentAlertActive = false;

  MOCK_PERIODS.forEach((period, index) => {
    const health = healthAtPeriod(client, index);
    if (health === null) return;
    push({
      type: 'IMPORT',
      severity: 'INFO',
      occurredAt: dateAfter(period.periodEnd, 2),
      periodEnd: period.periodEnd,
      title: `Importação mensal — ${period.label}`,
      description:
        'Atendimento, SLA, uso, financeiro e reuniões importados da planilha; score recalculado.',
      healthAt: health,
      fromClass: null,
      toClass: null,
      metricId: null,
      metricName: null,
    });
    const currentClass = classify(health);
    if (previousClass !== null && currentClass !== previousClass) {
      const worse =
        HEALTH_BANDS.findIndex((b) => b.class === currentClass) >
        HEALTH_BANDS.findIndex((b) => b.class === previousClass);
      push({
        type: 'CLASS_CHANGE',
        severity: worse ? (currentClass === 'CRITICAL' ? 'CRITICAL' : 'WARNING') : 'INFO',
        occurredAt: dateAfter(period.periodEnd, 2),
        periodEnd: period.periodEnd,
        title: `Passou de ${labelOf(previousClass)} para ${labelOf(currentClass)}`,
        description: `Health ${Math.round(health)}/100 em ${period.label}.`,
        healthAt: health,
        fromClass: previousClass,
        toClass: currentClass,
        metricId: null,
        metricName: null,
      });
    }
    previousClass = currentClass;

    const criticalPoint = critical?.series[index];
    const criticalHot = (criticalPoint?.health ?? 100) < 30;
    if (criticalHot && !criticalAlertActive && criticalPoint?.value !== null) {
      push({
        type: 'ALERT',
        severity: 'CRITICAL',
        occurredAt: dateAfter(period.periodEnd, 3),
        periodEnd: period.periodEnd,
        title: 'Gatilho: chamados críticos acima do limite',
        description: `${criticalPoint?.value ?? 0} chamados críticos em ${period.label} — piso de prioridade P1 sugerido (§27).`,
        healthAt: health,
        fromClass: null,
        toClass: null,
        metricId: critical?.metricId ?? null,
        metricName: critical?.metricName ?? null,
      });
    }
    criticalAlertActive = criticalHot;

    const paymentPoint = payment?.series[index];
    const paymentHot = (paymentPoint?.value ?? 0) >= 30;
    if (paymentHot && !paymentAlertActive) {
      push({
        type: 'ALERT',
        severity: 'WARNING',
        occurredAt: dateAfter(period.periodEnd, 3),
        periodEnd: period.periodEnd,
        title: 'Alerta: atraso de pagamento acima de 30 dias',
        description: `${paymentPoint?.value ?? 0} dias de atraso em ${period.label}.`,
        healthAt: health,
        fromClass: null,
        toClass: null,
        metricId: payment?.metricId ?? null,
        metricName: payment?.metricName ?? null,
      });
    }
    paymentAlertActive = paymentHot;
  });

  const done = completedRecommendation(client, scores);
  if (done && done.completedAt) {
    push({
      type: 'RECOMMENDATION_DONE',
      severity: 'INFO',
      occurredAt: done.completedAt,
      periodEnd: null,
      title: `Recomendação concluída: ${done.title}`,
      description: done.evidence,
      healthAt: null,
      fromClass: null,
      toClass: null,
      metricId: done.metricId,
      metricName: done.metricName,
    });
  }

  if (client.cancelledAtPeriod !== undefined) {
    const period = MOCK_PERIODS[client.cancelledAtPeriod]!;
    push({
      type: 'CANCELLATION',
      severity: 'CRITICAL',
      occurredAt: dateAfter(period.periodEnd, 0),
      periodEnd: period.periodEnd,
      title: `Cliente cancelou em ${period.label}`,
      description:
        'Registrado em situação_clientes; entra como alvo de validação da calibração (§59).',
      healthAt: healthAtPeriod(client, client.cancelledAtPeriod),
      fromClass: null,
      toClass: null,
      metricId: null,
      metricName: null,
    });
  }

  events.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  return {
    clientId,
    health: timePoints(client),
    portfolio: buildMockGeneralDashboard().timeline.portfolio,
    thresholds: MOCK_THRESHOLDS,
    events,
  };
}

function labelOf(healthClass: HealthClass): string {
  return { NORMAL: 'Normal', ATTENTION: 'Atenção', RISK: 'Risco', CRITICAL: 'Crítico' }[
    healthClass
  ];
}
