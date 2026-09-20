/**
 * O briefing: os dados REAIS da carteira virando texto que o modelo consegue ler (§39, §62).
 *
 * É aqui que mora a qualidade das respostas do Agente. O modelo não consulta banco, não chama
 * ferramenta e não "lembra" de nada: ele responde exclusivamente sobre o texto montado abaixo,
 * que sai dos mesmos snapshots que o dashboard mostra. Se um número não está no briefing, o
 * Agente tem a obrigação de dizer que não sabe — e é isso que o prompt exige.
 *
 * Tudo aqui é puro e determinístico: o mesmo relatório gera sempre o mesmo briefing, o que
 * torna as respostas reproduzíveis e o módulo testável sem rede.
 */
import {
  HEALTH_CLASS_LABELS,
  type GeneralDashboardData,
  type RankingRow,
  type RiskDashboardData,
} from '@inovaapss/shared';

/** Quantos clientes do ranking entram no briefing (os mais prioritários). */
export const BRIEFING_RANKING_LIMIT = 25;
/** Quantos pontos da linha do tempo entram. */
export const BRIEFING_TIMELINE_LIMIT = 18;
/** Quantas evidências por cliente. */
const EVIDENCE_LIMIT = 3;

const TREND_LABELS: Readonly<Record<RankingRow['trend'], string>> = {
  up: 'melhorando',
  down: 'piorando',
  stable: 'estável',
  unknown: 'sem histórico suficiente',
};

const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

function money(value: number, currency: string): string {
  return `${currency} ${integer.format(Math.round(value))}`;
}

function score(value: number | null): string {
  return value === null ? 'sem dado' : oneDecimal.format(value);
}

function classLabel(healthClass: string): string {
  return HEALTH_CLASS_LABELS[healthClass as keyof typeof HEALTH_CLASS_LABELS] ?? healthClass;
}

/** Sinal explícito na variação: "+3" e "-2" dizem mais que "3" e "2". */
function delta(value: number | null): string {
  if (value === null) return 'sem comparação com o mês anterior';
  if (value === 0) return 'estável';
  return value > 0 ? `+${integer.format(value)}` : integer.format(value);
}

export interface BriefingInput {
  organizationName: string;
  risk: RiskDashboardData;
  general: GeneralDashboardData;
}

/** Um cliente do ranking em uma linha densa, com tudo que sustenta uma resposta sobre ele. */
function rankingLine(row: RankingRow, currency: string): string {
  const parts = [
    `${row.position}. ${row.clientName}`,
    `classe ${classLabel(row.currentClass)}`,
    `saúde ${score(row.healthCurrent)}`,
    `prioridade ${score(row.priorityScore)}`,
    `risco ${score(row.riskScore)}`,
    `tendência ${TREND_LABELS[row.trend]}`,
    `MRR ${money(row.mrr, row.currency || currency)}`,
    `plano ${row.plan}`,
    `segmento ${row.segment}`,
    `porte ${row.size}`,
    `confiança da análise ${score(row.confidence)}`,
  ];
  if (row.crossesDown && row.projectedClass !== null) {
    parts.push(
      `ATENÇÃO: a projeção leva de ${classLabel(row.currentClass)} para ${classLabel(row.projectedClass)} no próximo mês (saúde projetada ${score(row.healthProjected)})`,
    );
  }
  const evidences = row.evidences.slice(0, EVIDENCE_LIMIT);
  const motivo =
    evidences.length > 0 ? `Motivos: ${evidences.join(' | ')}.` : `Motivo: ${row.topEvidence}.`;
  return `${parts.join('; ')}. ${motivo} Ação sugerida: ${row.suggestedAction}`;
}

/**
 * Monta o briefing. A ordem é a da pergunta que o produto responde (§1): com quem falar,
 * por quê, em que ordem — e só depois o panorama.
 */
export function buildBriefing(input: BriefingInput): string {
  const { organizationName, risk, general } = input;
  const currency = risk.kpis.currency;
  const lines: string[] = [];

  lines.push(`RELATÓRIO DE SAÚDE DE CLIENTES — ${organizationName}`);
  lines.push(`Período mais recente dos dados: ${risk.generatedAt || 'não informado'}.`);
  lines.push('');

  lines.push('## Números da carteira');
  lines.push(
    `- Clientes ativos: ${integer.format(risk.kpis.activeClients.value)} (variação no último mês: ${delta(risk.kpis.activeClients.delta)})`,
  );
  lines.push(
    `- Em estado Crítico: ${integer.format(risk.kpis.criticalClients.value)} (${delta(risk.kpis.criticalClients.delta)})`,
  );
  lines.push(
    `- Em Risco: ${integer.format(risk.kpis.riskClients.value)} (${delta(risk.kpis.riskClients.delta)})`,
  );
  lines.push(
    `- MRR ameaçado (soma do MRR de quem está em Risco ou Crítico): ${money(risk.kpis.mrrAtRisk.value, currency)} (${delta(risk.kpis.mrrAtRisk.delta)})`,
  );
  lines.push(
    `- MRR total recorrente da carteira: ${money(general.kpis.mrr.value, general.kpis.currency)} (${delta(general.kpis.mrr.delta)})`,
  );
  lines.push(
    `- Clientes cancelados até hoje: ${integer.format(general.kpis.cancelledClients.value)} (${delta(general.kpis.cancelledClients.delta)} no último mês)`,
  );
  lines.push('');

  lines.push('## Distribuição por classe de saúde (só clientes ativos)');
  for (const item of general.distribution) {
    lines.push(
      `- ${classLabel(item.healthClass)}: ${integer.format(item.count)} clientes (${oneDecimal.format(item.share * 100)}% da carteira), MRR ${money(item.mrr, general.kpis.currency)}`,
    );
  }
  lines.push(
    `Faixas usadas: Normal a partir de ${risk.forecast.thresholds.attention}, Atenção a partir de ${risk.forecast.thresholds.risk}, Risco a partir de ${risk.forecast.thresholds.critical}; abaixo disso é Crítico.`,
  );
  lines.push('');

  if (general.dimensions.length > 0) {
    lines.push('## Saúde média por dimensão (0 a 100, quanto maior melhor)');
    for (const dimension of general.dimensions) {
      lines.push(
        `- ${dimension.label}: ${score(dimension.health)} (${integer.format(dimension.clientCount)} clientes medidos)`,
      );
    }
    lines.push('');
  }

  const timeline = general.timeline.portfolio.slice(-BRIEFING_TIMELINE_LIMIT);
  if (timeline.length > 0) {
    lines.push('## Evolução da saúde média da carteira');
    lines.push(timeline.map((point) => `${point.label}: ${score(point.health)}`).join(' · '));
    lines.push('');
  }

  lines.push('## Ranking de prioridade — com quem falar, nesta ordem');
  lines.push(
    `A lista traz quem está em Risco/Crítico hoje ou cuja tendência cruza para baixo no próximo mês. ${integer.format(risk.forecast.crossingCount)} cliente(s) estão nessa virada.`,
  );
  lines.push(
    `A prioridade combina sinal de risco e impacto comercial (pesos: risco ${risk.priorityWeights.risk}, impacto ${risk.priorityWeights.impact}).`,
  );
  const ranking = risk.ranking.slice(0, BRIEFING_RANKING_LIMIT);
  if (ranking.length === 0) {
    lines.push('Nenhum cliente precisa de atenção neste momento.');
  } else {
    for (const row of ranking) lines.push(rankingLine(row, currency));
    if (risk.ranking.length > ranking.length) {
      lines.push(
        `(A lista completa tem ${integer.format(risk.ranking.length)} clientes; acima estão os ${integer.format(ranking.length)} mais prioritários.)`,
      );
    }
  }

  return lines.join('\n');
}

/** Um documento anexado à conversa, já com o texto extraído. */
export interface BriefingDocument {
  fileName: string;
  text: string;
}

/** Limite do trecho de documento levado ao modelo, para a pergunta caber no contexto. */
export const DOCUMENT_CONTEXT_CHARS = 60_000;

export function buildDocumentSection(document: BriefingDocument): string {
  const text = document.text.slice(0, DOCUMENT_CONTEXT_CHARS);
  const cut = document.text.length > DOCUMENT_CONTEXT_CHARS;
  return [
    `## Documento anexado: ${document.fileName}`,
    cut ? '(texto cortado no limite de contexto; não conclua nada sobre o final)' : '',
    '--- início do documento ---',
    text,
    '--- fim do documento ---',
  ]
    .filter((line) => line !== '')
    .join('\n');
}
