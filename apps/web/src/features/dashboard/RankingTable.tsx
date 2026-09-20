import { ArrowDown, ArrowUp, ArrowUpDown, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  HEALTH_CLASS_LABELS,
  PROJECTION_CONFIDENCE_LABELS,
  type HealthTrend,
  type RankingRow,
} from '@inovaapss/shared';

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

import { HealthPill, PriorityPill } from './HealthPill';

export interface RankingTableProps {
  /** Já ordenado por prioridade pela API; a tabela reordena localmente ao clicar no cabeçalho. */
  rows: RankingRow[];
  /** CTA "Analisar" → /clients/:id. */
  onSelect: (clientId: string) => void;
}

type SortKey =
  | 'position'
  | 'clientName'
  | 'healthCurrent'
  | 'healthProjected'
  | 'riskScore'
  | 'confidence'
  | 'mrr';

interface SortState {
  key: SortKey;
  direction: 'asc' | 'desc';
}

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'position', label: 'Prioridade' },
  { key: 'clientName', label: 'Cliente' },
  { key: 'healthCurrent', label: 'Health', numeric: true },
  { key: 'healthProjected', label: 'Health projetado', numeric: true },
  { key: 'riskScore', label: 'Risco', numeric: true },
  { key: 'confidence', label: 'Confiança', numeric: true },
  { key: 'mrr', label: 'Valor mensal', numeric: true },
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

function compare(a: RankingRow, b: RankingRow, key: SortKey): number {
  if (key === 'clientName') return a.clientName.localeCompare(b.clientName);
  const left = a[key];
  const right = b[key];
  // Sem projeção vai para o fim, em qualquer direção.
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return left - right;
}

/**
 * Tabela de ranking (§39): Prioridade, Cliente, Health (número + pílula da classe), Health
 * projetado e Confiança da projeção (irmã do gráfico — DATAVIZ.md §5.1), Risco, Confiança,
 * Valor mensal, Principal evidência (com a ação sugerida), Ação.
 */
export function RankingTable({ rows, onSelect }: RankingTableProps) {
  const [sort, setSort] = useState<SortState>({ key: 'position', direction: 'asc' });

  const sorted = useMemo(() => {
    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const result = compare(a, b, sort.key);
      // Nulos ficam no fim independentemente da direção.
      if (sort.key !== 'clientName' && (a[sort.key] === null || b[sort.key] === null))
        return result;
      return result * factor || a.position - b.position;
    });
  }, [rows, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'position' || key === 'clientName' ? 'asc' : 'desc' },
    );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {COLUMNS.map((column) => {
            const isSorted = sort.key === column.key;
            const SortIcon = !isSorted
              ? ArrowUpDown
              : sort.direction === 'asc'
                ? ArrowUp
                : ArrowDown;
            return (
              <TableHead
                key={column.key}
                scope="col"
                aria-sort={
                  isSorted ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
                }
                className={cn(column.numeric && 'text-right')}
              >
                <button
                  type="button"
                  onClick={() => toggleSort(column.key)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50',
                    column.numeric && 'flex-row-reverse',
                  )}
                >
                  {column.label}
                  <SortIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
                </button>
              </TableHead>
            );
          })}
          <TableHead scope="col">Principal evidência</TableHead>
          <TableHead scope="col">Ação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={COLUMNS.length + 2}
              className="py-8 text-center text-muted-foreground"
            >
              Nenhum cliente corresponde aos filtros.
            </TableCell>
          </TableRow>
        ) : (
          sorted.map((row) => (
            <TableRow key={row.clientId} data-client-id={row.clientId}>
              <TableCell>
                <span className="inline-flex items-center gap-2">
                  <span className="w-6 text-right tabular-nums text-muted-foreground">
                    {row.position}
                  </span>
                  <PriorityPill priorityClass={row.priorityClass} />
                  <span className="sr-only">, prioridade {formatInteger(row.priorityScore)}</span>
                </span>
              </TableCell>
              <TableCell className="font-medium">{row.clientName}</TableCell>
              <TableCell className="text-right">
                <span className="inline-flex items-center justify-end gap-2">
                  <span className="tabular-nums">{formatInteger(row.healthCurrent)}</span>
                  <HealthPill healthClass={row.currentClass} />
                  <TrendIcon trend={row.trend} />
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.healthProjected === null ? (
                  <span className="text-muted-foreground">sem projeção</span>
                ) : (
                  <span className={cn(row.crossesDown && 'font-semibold')}>
                    {formatInteger(row.healthProjected)}
                    <span className="ml-1 text-muted-foreground">
                      {HEALTH_CLASS_LABELS[row.projectedClass ?? row.currentClass]} · confiança{' '}
                      {PROJECTION_CONFIDENCE_LABELS[row.projectionConfidence]}
                    </span>
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatInteger(row.riskScore)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPercent(row.confidence)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatCurrency(row.mrr)}</TableCell>
              <TableCell className="max-w-72 whitespace-normal">
                <span className="block">{row.topEvidence}</span>
                <span className="block text-xs text-muted-foreground">→ {row.suggestedAction}</span>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="whitespace-nowrap"
                  onClick={() => onSelect(row.clientId)}
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
