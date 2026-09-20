import type { RankingRow } from '@inovaapss/shared';

import { formatInteger } from '@/lib/format';

import type { ReactNode } from 'react';

function GuideItem({
  number,
  title,
  scale,
  children,
}: {
  number: number;
  title: string;
  scale: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {number}
        </span>
        <div className="min-w-0">
          <h4 className="font-semibold">{title}</h4>
          <p className="mt-0.5 text-xs font-medium text-muted-foreground">{scale}</p>
        </div>
      </div>
      <div className="mt-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

/** Explica os scores que aparecem juntos no ranking e evita tratá-los como probabilidades. */
export function ScoreGuide({ example }: { example: RankingRow }) {
  return (
    <section aria-labelledby="score-guide-title" className="space-y-3">
      <div>
        <h3 id="score-guide-title" className="text-base font-semibold">
          O que significa cada número
        </h3>
        <p className="text-[13px] text-muted-foreground">
          Saúde, projeção e risco estão relacionados. Eles não são três avaliações concorrentes.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <GuideItem number={1} title="Saúde atual" scale="0 = pior · 100 = melhor">
          Resume como o cliente está agora a partir de uso, atendimento, SLA, financeiro e demais
          métricas disponíveis.
          <strong className="mt-2 block text-foreground">
            Exemplo: {example.clientName} está com {formatInteger(example.healthCurrent)}/100.
          </strong>
        </GuideItem>

        <GuideItem number={2} title="Saúde projetada" scale="Estimativa para o próximo período">
          Prolonga a tendência recente da saúde. Indica para onde o cliente está caminhando e não
          representa uma probabilidade de cancelamento.
          <strong className="mt-2 block text-foreground">
            {example.healthProjected === null
              ? 'Exemplo: ainda não há histórico suficiente para projetar.'
              : `Exemplo: a saúde pode ir para ${formatInteger(example.healthProjected)}/100.`}
          </strong>
        </GuideItem>

        <GuideItem
          number={3}
          title="Risco de cancelamento"
          scale="0 = menor risco · 100 = maior risco"
        >
          É um sinal calculado como <strong className="text-foreground">100 − saúde atual</strong>.{' '}
          É um score de atenção, não a porcentagem de chance de o cliente cancelar. A coluna mostra
          o risco de agora; a projeção não altera esse número antecipadamente.
          <strong className="mt-2 block text-foreground">
            Exemplo: 100 − {formatInteger(example.healthCurrent)} ={' '}
            {formatInteger(example.riskScore)}/100 de risco.
          </strong>
        </GuideItem>
      </div>

      <p className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
        <strong className="text-foreground">Confiança dos dados</strong> indica quanto a análise é
        sustentada por métricas disponíveis e recentes.{' '}
        <strong className="text-foreground">Confiança da projeção</strong> indica se há histórico
        suficiente para estimar o próximo período.{' '}
        <strong className="text-foreground">Prioridade de atendimento</strong> combina o risco de
        cancelamento com o impacto comercial e define a ordem do ranking.
      </p>
    </section>
  );
}
