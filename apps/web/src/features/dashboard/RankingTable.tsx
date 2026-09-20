import { Minus, TrendingDown, TrendingUp } from 'lucide-react';

import { PROJECTION_CONFIDENCE_LABELS, type HealthTrend, type RankingRow } from '@inovaapss/shared';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency, formatInteger, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';

import { HEALTH_STATUS_LABELS } from './health-labels';
import { HealthPill, PriorityPill } from './HealthPill';

export interface RankingTableProps {
  /** Já ordenado por prioridade pela API; a tabela mostra a lista na ordem recebida. */
  rows: RankingRow[];
  /** CTA "Analisar": abre a prévia do caso, sem sair da fila. */
  onSelect: (row: RankingRow) => void;
}

/**
 * Colunas secundárias só entram quando a tela dá espaço: no celular ficam de fora (o dado continua
 * no DOM, apenas escondido) e o que sobra conta a história — quem é, como está, o que fazer.
 * A mesma classe vai no cabeçalho e na célula, senão a tabela desalinha.
 */
type Breakpoint = 'md' | 'lg' | 'xl';
const FROM: Readonly<Record<Breakpoint, string>> = {
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
};

const COLUMNS: { label: string; hint?: string; numeric?: boolean; from?: Breakpoint }[] = [
  { label: 'Prioridade' },
  { label: 'Cliente' },
  { label: 'Saúde atual', hint: 'maior é melhor', numeric: true },
  { label: 'Saúde projetada', hint: 'próximo período', numeric: true, from: 'lg' },
  { label: 'Risco de cancelamento', hint: 'score, não %', numeric: true, from: 'md' },
  { label: 'Confiança dos dados', hint: 'cobertura e atualidade', numeric: true, from: 'xl' },
  { label: 'Valor mensal', numeric: true, from: 'lg' },
];

const TREND_TEXT: Readonly<Record<HealthTrend, string>> = {
  up: 'tendência de melhora',
  down: 'tendência de queda',
  stable: 'tendência estável',
  unknown: 'tendência desconhecida',
};

function TrendIcon({ trend }: { trend: HealthTrend }) {
  const Icon = trend === 'down' ? TrendingDown : trend === 'up' ? TrendingUp : Minus;
  return (
    <>
      <Icon aria-hidden="true" className="size-3.5 text-muted-foreground" />
      <span className="sr-only">{TREND_TEXT[trend]}</span>
    </>
  );
}

/** Valor mensal ponderado pelo score de risco (`mrr × risco / 100`); não é perda esperada. */
function revenueAtRisk(row: RankingRow): number {
  return (row.mrr * row.riskScore) / 100;
}

/**
 * Tabela de ranking (§39): Prioridade, Cliente, Saúde atual (número + classe), Saúde projetada,
 * Risco de cancelamento, Confiança dos dados, Valor mensal (com a receita em risco), Principal
 * evidência (com a ação sugerida) e Ação.
 * Lista fixa, na ordem de prioridade: o representante não reordena nem filtra.
 */
export function RankingTable({ rows, onSelect }: RankingTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {COLUMNS.map((column) => (
            <TableHead
              key={column.label}
              scope="col"
              className={cn(column.numeric && 'text-right', column.from && FROM[column.from])}
            >
              <span className="block">{column.label}</span>
              {/* O espaço separa rótulo e dica no nome acessível: sem ele o leitor de tela
                  anuncia "Saúde atualmaior é melhor". Entre dois blocos não muda o desenho. */}
              {column.hint ? (
                <>
                  {' '}
                  <span className="block text-[11px] font-normal text-muted-foreground">
                    {column.hint}
                  </span>
                </>
              ) : null}
            </TableHead>
          ))}
          <TableHead scope="col" className={FROM.xl}>
            Principal evidência
          </TableHead>
          <TableHead scope="col">Ação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={COLUMNS.length + 2}
              className="py-8 text-center text-muted-foreground"
            >
              Nenhum cliente para acompanhar.
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow key={row.clientId} data-client-id={row.clientId}>
              <TableCell>
                <span className="inline-flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
                  <span className="w-6 tabular-nums text-muted-foreground sm:text-right">
                    {row.position}
                  </span>
                  <PriorityPill priorityClass={row.priorityClass} />
                  <span className="sr-only">, prioridade {formatInteger(row.priorityScore)}</span>
                </span>
              </TableCell>
              <TableCell className="font-medium whitespace-normal md:whitespace-nowrap">
                {row.clientName}
              </TableCell>
              <TableCell className="text-right">
                {/* Celular: número em cima, selo embaixo. De sm em diante, tudo na mesma linha. */}
                <span className="inline-flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                  <span className="tabular-nums whitespace-nowrap">
                    {formatInteger(row.healthCurrent)}/100
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <HealthPill healthClass={row.currentClass} />
                    <TrendIcon trend={row.trend} />
                  </span>
                </span>
              </TableCell>
              <TableCell className={cn('text-right tabular-nums', FROM.lg)}>
                {row.healthProjected === null ? (
                  <span className="text-muted-foreground">sem projeção</span>
                ) : (
                  <span className={cn('block', row.crossesDown && 'font-semibold')}>
                    {formatInteger(row.healthProjected)}/100
                    <span className="mt-0.5 block text-xs font-normal whitespace-normal text-muted-foreground">
                      {HEALTH_STATUS_LABELS[row.projectedClass ?? row.currentClass]} · confiança da
                      projeção: {PROJECTION_CONFIDENCE_LABELS[row.projectionConfidence]}
                    </span>
                  </span>
                )}
              </TableCell>
              <TableCell className={cn('text-right tabular-nums', FROM.md)}>
                <span className="font-medium">{formatInteger(row.riskScore)}/100</span>
              </TableCell>
              <TableCell className={cn('text-right tabular-nums', FROM.xl)}>
                {formatPercent(row.confidence)}
              </TableCell>
              <TableCell className={cn('text-right tabular-nums', FROM.lg)}>
                <span className="block">{formatCurrency(row.mrr)}</span>
                <span className="mt-0.5 block text-xs whitespace-normal text-muted-foreground">
                  {formatCurrency(revenueAtRisk(row))} ponderados pelo score
                </span>
              </TableCell>
              <TableCell className={cn('max-w-72 whitespace-normal', FROM.xl)}>
                <span className="block">{row.topEvidence}</span>
                <span className="block text-xs text-muted-foreground">→ {row.suggestedAction}</span>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="whitespace-nowrap"
                  onClick={() => onSelect(row)}
                  aria-label={`Analisar ${row.clientName}`}
                >
                  Analisar
                </Button>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
