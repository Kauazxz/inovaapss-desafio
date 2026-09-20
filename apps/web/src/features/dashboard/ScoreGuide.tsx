import type { ReactNode } from 'react';

import {
  PRIORITY_CLASS_LABELS,
  type PriorityWeights,
  type RankingRow,
} from '@inovaapss/shared';

import { formatInteger } from '@/lib/format';

function GuideItem({
  number,
  question,
  title,
  value,
  scale,
  children,
}: {
  number: number;
  question: string;
  title: string;
  value: string;
  scale: string;
  children: ReactNode;
}) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {number}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{question}</p>
          <h4 className="mt-0.5 font-semibold">{title}</h4>
        </div>
      </div>

      <p className="mt-4 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="text-xs font-medium text-muted-foreground">{scale}</p>
      <div className="mt-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </article>
  );
}

/** Traduz os scores do ranking em quatro perguntas práticas, usando o primeiro cliente. */
export function ScoreGuide({
  example,
  priorityWeights,
}: {
  example: RankingRow;
  priorityWeights: PriorityWeights;
}) {
  const projected =
    example.healthProjected === null
      ? 'Sem projeção'
      : `${formatInteger(example.healthProjected)}/100`;

  return (
    <section aria-labelledby="score-guide-title" className="space-y-4">
      <div>
        <h3 id="score-guide-title" className="text-base font-semibold">
          Como ler esta tela
        </h3>
        <p className="text-[13px] text-muted-foreground">
          Leia da esquerda para a direita: situação de hoje, tendência, alerta e ordem de ação.
        </p>
      </div>

      <p className="rounded-lg border-l-4 border-l-primary bg-muted/50 px-4 py-3 text-sm">
        <strong>Regra principal:</strong> saúde atual e risco atual são a mesma situação vista em
        sentidos opostos. Eles sempre somam 100. Para {example.clientName},{' '}
        <strong>
          saúde {formatInteger(example.healthCurrent)} + risco {formatInteger(example.riskScore)} =
          100
        </strong>
        .
      </p>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <GuideItem
          number={1}
          question="Como o cliente está hoje?"
          title="Saúde atual"
          value={`${formatInteger(example.healthCurrent)}/100`}
          scale="Quanto maior, melhor"
        >
          É a nota de hoje. Cada indicador, como uso, atendimento, SLA e financeiro, vira uma nota
          de 0 a 100. Os indicadores mais importantes pesam mais. Quando falta informação, a
          confiança diminui; a informação ausente não vira nota zero.
        </GuideItem>

        <GuideItem
          number={2}
          question="Para onde ele está indo?"
          title="Saúde projetada"
          value={projected}
          scale="Estimativa do próximo período"
        >
          Compara as últimas {example.trendWindow} notas de saúde e prolonga esse movimento por mais
          um período. Mostra onde a saúde pode chegar se o comportamento continuar. É uma tendência,
          não uma certeza nem uma chance de cancelamento.
        </GuideItem>

        <GuideItem
          number={3}
          question="Qual é o alerta de hoje?"
          title="Sinal de risco de cancelamento"
          value={`${formatInteger(example.riskScore)}/100`}
          scale="Quanto maior, maior a atenção necessária"
        >
          É a saúde atual invertida: 100 − {formatInteger(example.healthCurrent)} ={' '}
          {formatInteger(example.riskScore)}. O número mostra a intensidade do alerta.{' '}
          <strong className="text-foreground">
            {formatInteger(example.riskScore)} não significa {formatInteger(example.riskScore)}% de
            chance de cancelar.
          </strong>
          {' '}A coluna mostra o risco de agora; a projeção não altera esse número antecipadamente.
        </GuideItem>

        <GuideItem
          number={4}
          question="Com quem falar primeiro?"
          title="Prioridade de atendimento"
          value={`${formatInteger(example.priorityScore)}/100`}
          scale={PRIORITY_CLASS_LABELS[example.priorityClass]}
        >
          Define a posição na fila. Combina {formatInteger(priorityWeights.risk * 100)}% do sinal de
          risco com {formatInteger(priorityWeights.impact * 100)}% do impacto comercial, como valor
          do contrato e importância estratégica.
        </GuideItem>
      </div>

      <div className="grid gap-2 rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground md:grid-cols-2">
        <p>
          <strong className="text-foreground">Confiança dos dados:</strong> mostra se há informações
          suficientes e recentes para calcular a saúde atual.
        </p>
        <p>
          <strong className="text-foreground">Confiança da projeção:</strong> mostra se existe
          histórico suficiente para estimar o próximo período.
        </p>
      </div>
    </section>
  );
}
