import { ChartNoAxesColumn, TableProperties } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { CHART_MARKS } from '@/lib/chart-theme';
import { cn } from '@/lib/utils';

export interface ChartFigureProps {
  /** O "e daí?" — a conclusão, não a descrição do eixo (DATAVIZ.md §1.5). */
  title: string;
  /** Janela, fonte, ressalvas ("projeção por tendência — não é modelo preditivo"). */
  subtitle?: string | undefined;
  /** Resumo em texto para leitores de tela: o que o gráfico mostra, com os números que importam. */
  summary: string;
  /** O gráfico. */
  children: ReactNode;
  /** O irmão em tabela (DATAVIZ.md §1.8). Quando presente, aparece o botão "Ver como tabela". */
  table?: ReactNode | undefined;
  /** Ações extras à direita do título (ex.: "mostrar mais"). */
  actions?: ReactNode | undefined;
  /** Ao recarregar dados, mantém o gráfico anterior a 60 % (DATAVIZ.md §2.4). */
  reloading?: boolean | undefined;
  className?: string | undefined;
}

/**
 * Moldura comum dos gráficos: título com o "e daí?", subtítulo, resumo acessível e o
 * alternador gráfico/tabela. Sem borda, sem card (§57; DATAVIZ.md §1.3).
 */
export function ChartFigure({
  title,
  subtitle,
  summary,
  children,
  table,
  actions,
  reloading = false,
  className,
}: ChartFigureProps) {
  const titleId = useId();
  const summaryId = useId();
  const [showTable, setShowTable] = useState(false);

  return (
    <figure
      aria-labelledby={titleId}
      aria-describedby={summaryId}
      className={cn('min-w-0', className)}
    >
      <figcaption className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={titleId} className="text-base font-semibold leading-snug">
            {title}
          </h3>
          {subtitle ? <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {table ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={showTable}
              onClick={() => setShowTable((value) => !value)}
            >
              {showTable ? (
                <ChartNoAxesColumn aria-hidden="true" />
              ) : (
                <TableProperties aria-hidden="true" />
              )}
              {showTable ? 'Ver como gráfico' : 'Ver como tabela'}
            </Button>
          ) : null}
        </div>
      </figcaption>
      <p id={summaryId} className="sr-only">
        {summary}
      </p>
      <div
        style={reloading ? { opacity: CHART_MARKS.reloadingOpacity } : undefined}
        aria-busy={reloading || undefined}
      >
        {showTable && table ? table : children}
      </div>
    </figure>
  );
}
