import { CircleCheck, CircleDashed, CircleX, Loader } from 'lucide-react';

import {
  buildHealthSummaryLines,
  HEALTH_CLASS_LABELS,
  RECOMMENDATION_STATUS_LABELS,
  type ClientHealthOverview,
  type EvidenceDto,
  type MetricScoreDto,
  type RecommendationDto,
  type RecommendationStatus,
} from '@inovaapss/shared';

import { RankedBarChart, type RankedBarDatum } from '@/components/charts/ranked-bar-chart';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatInteger } from '@/lib/format';

import { useClientEvidence, useClientRecommendations, useClientScores } from '../api';
import { formatDecimal, formatMetricValue, formatSignedDelta, formatWeight } from '../format';
import { SectionTitle } from '../SectionTitle';
import { metricScoresTitle } from '../titles';

/** Quantas métricas recebem a cor de destaque: as que mais puxam o health para baixo. */
const HIGHLIGHTED_DRIVERS = 3;

function ScoresChart({
  overview,
  scores,
}: {
  overview: ClientHealthOverview;
  scores: MetricScoreDto[];
}) {
  const evaluated = scores.filter(
    (score): score is MetricScoreDto & { metricHealth: number } => score.metricHealth !== null,
  );
  const notEvaluated = scores.filter((score) => score.metricHealth === null);
  const highlightedIds = new Set(
    [...evaluated]
      .filter((score) => score.contribution > 0)
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, HIGHLIGHTED_DRIVERS)
      .map((score) => score.metricId),
  );
  // A barra é a distância até 100 (quanto mais longa, pior): assim o ranking sai do pior para
  // o melhor (DATAVIZ.md §4.3) e o rótulo na ponta continua sendo o health da métrica.
  const data: RankedBarDatum[] = evaluated.map((score) => ({
    id: score.metricId,
    label: score.metricName,
    value: 100 - score.metricHealth,
    highlighted: highlightedIds.has(score.metricId),
    note: `${score.healthClass ? HEALTH_CLASS_LABELS[score.healthClass] : ''} · peso ${formatWeight(score.weight)} · tira ${formatDecimal(score.contribution, 1)} pontos do health · ${score.explanation.summary}`,
  }));
  const riskScore = overview.score?.riskScore ?? null;

  return (
    <div className="space-y-3">
      <RankedBarChart
        title={metricScoresTitle(scores, riskScore)}
        subtitle={`Health de cada métrica (0–100), da pior para a melhor · barra = distância até 100 · em azul, as ${HIGHLIGHTED_DRIVERS} que mais puxam o health para baixo · ${overview.score?.modelVersion ?? ''}`}
        data={data}
        valueLabel="Health da métrica"
        labelHeading="Métrica"
        noteHeading="Classe · peso · contribuição · evidência"
        maxValue={100}
        formatValue={(value) => `${formatInteger(100 - value)}/100`}
      />
      {notEvaluated.length > 0 ? (
        <ul aria-label="Métricas sem avaliação neste período" className="space-y-1 text-sm">
          {notEvaluated.map((score) => (
            <li key={score.metricId} className="flex flex-wrap gap-x-2 text-muted-foreground">
              <span className="font-medium text-foreground">{score.metricName}</span>
              <span>N/A — {score.naReason ?? 'sem dado no período'}</span>
              <span>
                · peso {formatWeight(score.weight)} redistribuído; reduz a confiança, não a saúde
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function EvidenceList({ items }: { items: EvidenceDto[] }) {
  const negative = items.filter((item) => item.isNegative);
  if (negative.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma métrica está puxando o health para baixo.
      </p>
    );
  }
  return (
    <ol aria-label="Evidências por contribuição" className="space-y-3">
      {negative.map((item) => (
        <li
          key={item.metricId}
          className="grid gap-x-6 gap-y-1 border-l-2 border-border pl-3 md:grid-cols-[1fr_auto]"
        >
          <div>
            <p className="text-sm font-medium">
              <span className="text-muted-foreground">{item.rank}.</span> {item.humanExplanation}
            </p>
            <p className="text-xs text-muted-foreground">
              {item.metricName} · health{' '}
              {item.healthScore === null ? 'N/A' : `${formatInteger(item.healthScore)}/100`} · peso{' '}
              {formatWeight(item.weight)} · tira {formatDecimal(item.contribution, 1)} pontos
            </p>
          </div>
          <dl className="flex flex-wrap gap-x-4 text-xs text-muted-foreground md:justify-end">
            <div>
              <dt className="inline">Atual: </dt>
              <dd className="inline tabular-nums">
                {formatMetricValue(item.currentValue, item.unit)}
              </dd>
            </div>
            <div>
              <dt className="inline">Baseline: </dt>
              <dd className="inline tabular-nums">
                {item.baselineValue === null
                  ? '—'
                  : formatMetricValue(item.baselineValue, item.unit)}
              </dd>
            </div>
            <div>
              <dt className="inline">Variação: </dt>
              <dd className="inline tabular-nums">
                {formatSignedDelta(item.delta, item.unit ?? '') ?? '—'}
              </dd>
            </div>
          </dl>
        </li>
      ))}
    </ol>
  );
}

const STATUS_ICON: Readonly<Record<RecommendationStatus, typeof CircleCheck>> = {
  PENDING: CircleDashed,
  IN_PROGRESS: Loader,
  DONE: CircleCheck,
  DISMISSED: CircleX,
};

function RecommendationList({ items }: { items: RecommendationDto[] }) {
  return (
    <ol aria-label="Recomendações" className="space-y-4">
      {items.map((item) => {
        const Icon = STATUS_ICON[item.status];
        return (
          <li key={item.id} className="flex gap-3">
            <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{item.title}</p>
                <Badge variant={item.status === 'DONE' ? 'secondary' : 'outline'}>
                  {RECOMMENDATION_STATUS_LABELS[item.status]}
                </Badge>
                {item.triggerType === 'CRITICAL_TRIGGER' ? (
                  <Badge variant="destructive">gatilho crítico</Badge>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">{item.description}</p>
              <p className="text-xs text-muted-foreground">
                {item.metricName ? `${item.metricName} · ` : ''}
                {item.evidence ? `por quê: ${item.evidence}` : ''}
                {item.completedAt
                  ? ` · concluída em ${new Date(item.completedAt).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}`
                  : ''}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Aba "Visão geral" (§40): resumo §58 em texto, os 10 scores em barras (§29), a lista de
 * evidências, as recomendações com playbook (§30) e o espaço dos contratos (Etapa 2).
 */
export function OverviewTab({ overview }: { overview: ClientHealthOverview }) {
  const scores = useClientScores(overview.client.id);
  const evidence = useClientEvidence(overview.client.id);
  const recommendations = useClientRecommendations(overview.client.id);
  const lines = buildHealthSummaryLines(overview.score, overview.topDrivers);

  return (
    <div className="space-y-10">
      <section aria-labelledby="resumo-title" className="space-y-3">
        <SectionTitle
          id="resumo-title"
          hint="Score, classe, confiança e os principais motivos, em texto (§58)."
        >
          Resumo
        </SectionTitle>
        <div className="grid gap-6 md:grid-cols-[auto_1fr]">
          <dl className="space-y-1 text-sm">
            <div className="font-medium">{lines.health}</div>
            <div>{lines.risk}</div>
            <div>{lines.priority}</div>
            <div>{lines.confidence}</div>
          </dl>
          <div>
            <p className="text-sm font-medium">Principais drivers</p>
            {lines.drivers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma métrica está puxando o health para baixo.
              </p>
            ) : (
              <ol aria-label="Principais drivers" className="mt-1 space-y-1 text-sm">
                {lines.drivers.map((driver) => (
                  <li key={driver}>{driver}</li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="scores-title" className="space-y-3">
        <span id="scores-title" className="sr-only">
          Os 10 scores de métrica
        </span>
        {scores.isPending ? (
          <Skeleton className="h-72 w-full" aria-label="Carregando os scores" />
        ) : scores.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Não foi possível carregar os scores das métricas.
          </p>
        ) : (
          <ScoresChart overview={overview} scores={scores.data.items} />
        )}
      </section>

      <section aria-labelledby="evidencias-title" className="space-y-3">
        <SectionTitle
          id="evidencias-title"
          hint="Ordenadas pela contribuição para o risco (peso × distância até 100), com valor atual, baseline e variação."
        >
          Evidências
        </SectionTitle>
        {evidence.isPending ? (
          <Skeleton className="h-40 w-full" aria-label="Carregando as evidências" />
        ) : evidence.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Não foi possível carregar as evidências.
          </p>
        ) : (
          <EvidenceList items={evidence.data.items} />
        )}
      </section>

      <section aria-labelledby="recomendacoes-title" className="space-y-3">
        <SectionTitle
          id="recomendacoes-title"
          hint="Playbook de cada métrica (§30): o que fazer, em ordem, e o status de cada ação."
        >
          Recomendações
        </SectionTitle>
        {recommendations.isPending ? (
          <Skeleton className="h-40 w-full" aria-label="Carregando as recomendações" />
        ) : recommendations.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Não foi possível carregar as recomendações.
          </p>
        ) : (
          <RecommendationList items={recommendations.data.items} />
        )}
      </section>

      {/*
        Slot dos contratos (Etapa 2): na integração, o componente ContractsPanel({ clientId })
        de `@/features/contracts` é montado aqui, no lugar do parágrafo abaixo:
          <ContractsPanel clientId={overview.client.id} />
      */}
      <section id="contratos" aria-labelledby="contratos-title" className="space-y-3">
        <SectionTitle id="contratos-title" hint="Planos, valores e vigências do cliente.">
          Contratos
        </SectionTitle>
        <p className="text-sm text-muted-foreground">
          {overview.contract
            ? `Contrato ${overview.contract.code} · plano ${overview.plan?.name ?? '—'} · ${overview.contract.status.toLowerCase()}. A lista completa de contratos e planos deste cliente aparece aqui quando a Etapa 2 for integrada.`
            : 'Nenhum contrato cadastrado. A lista de contratos e planos aparece aqui quando a Etapa 2 for integrada.'}
        </p>
      </section>
    </div>
  );
}
