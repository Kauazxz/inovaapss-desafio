import type { ClientHealthOverview } from '@inovaapss/shared';

import { Skeleton } from '@/components/ui/skeleton';

import { useClientScores } from '../api';
import { MetricTrendChart } from '../MetricTrendChart';
import { SectionTitle } from '../SectionTitle';
import { npsTitle } from '../titles';

/**
 * Aba "NPS" (§40): uma pesquisa por trimestre. "Não respondeu" é um estado válido, mostrado como
 * tal — nunca como zero e nunca como ausência silenciosa (§22).
 */
export function NpsTab({ overview }: { overview: ClientHealthOverview }) {
  const scores = useClientScores(overview.client.id);
  if (scores.isPending) {
    return (
      <div role="status" aria-label="Carregando a aba NPS" className="space-y-4">
        <Skeleton className="h-5 w-full max-w-72" />
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }
  if (scores.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Não foi possível carregar o NPS.
      </p>
    );
  }
  const score = scores.data.items.find((item) => item.dimension === 'nps');
  if (!score) {
    return <p className="text-sm text-muted-foreground">Nenhuma métrica de NPS no modelo ativo.</p>;
  }
  const quarters = score.series.map((point) => ({
    label: point.label,
    periodEnd: point.periodEnd,
    answered: point.value !== null,
    score: point.value,
    classification:
      typeof point.extra?.['classification'] === 'string' ? point.extra['classification'] : null,
    portfolio: point.portfolioValue,
  }));

  return (
    <div className="space-y-8">
      <p className="max-w-3xl text-sm text-muted-foreground">
        NPS (peso 3 %): nota de 0 a 10 quando o cliente responde; quando não responde, a métrica
        fica N/A, o peso é redistribuído e a confiança cai — a sequência sem resposta é um sinal por
        si só (§22).
      </p>

      <section aria-labelledby="nps-respostas-title" className="space-y-3">
        <SectionTitle
          id="nps-respostas-title"
          hint="Uma pesquisa por trimestre; a média da carteira considera só quem respondeu."
        >
          {npsTitle(quarters)}
        </SectionTitle>
        {/* Uma nota por linha no celular, duas no tablet, os quatro trimestres em linha no
            notebook: a nota e o que ela significa ficam sempre juntos. */}
        <ol
          aria-label="Respostas por trimestre"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {quarters.map((quarter) => (
            <li key={quarter.periodEnd} className="min-w-0 border-l-2 border-border pl-3">
              <p className="text-xs text-muted-foreground">{quarter.label}</p>
              {quarter.answered && quarter.score !== null ? (
                <>
                  <p className="text-lg font-semibold tracking-tight">
                    {quarter.score}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">/ 10</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {quarter.classification ?? ''}
                    {quarter.portfolio !== null
                      ? ` · carteira ${quarter.portfolio.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}`
                      : ''}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold tracking-tight text-muted-foreground">—</p>
                  <p className="text-xs text-muted-foreground">não respondeu</p>
                </>
              )}
            </li>
          ))}
        </ol>
      </section>

      <MetricTrendChart score={score} periodLabel="trimestre" domainMax={10} />
    </div>
  );
}
