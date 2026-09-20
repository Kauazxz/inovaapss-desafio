import { Archive, ArrowDown, ArrowUp, ArrowUpDown, Pencil } from 'lucide-react';
import { Link } from 'react-router';

import type { ClientSortField, SortOrder } from '@inovaapss/validation';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

import { CLIENT_STATUS_LABELS, formatMoney } from './labels';

import type { PortfolioClient } from './api';

export interface ClientsTableProps {
  items: PortfolioClient[];
  sort: ClientSortField;
  order: SortOrder;
  onSortChange: (sort: ClientSortField, order: SortOrder) => void;
  /** Sem permissão de escrita (viewer), as ações somem. */
  canWrite: boolean;
  onEdit: (client: PortfolioClient) => void;
  onArchive: (client: PortfolioClient) => void;
}

const COLUMNS: { key: ClientSortField; label: string; numeric?: boolean }[] = [
  { key: 'name', label: 'Nome' },
  { key: 'externalCode', label: 'Código' },
  { key: 'segment', label: 'Segmento' },
  { key: 'size', label: 'Porte' },
  { key: 'planName', label: 'Plano' },
  { key: 'monthlyValue', label: 'Valor mensal', numeric: true },
  { key: 'status', label: 'Status' },
];

/** Tabela da carteira (§38 /clients): ordenação pelo cabeçalho (feita pela API) e ações por linha. */
export function ClientsTable({
  items,
  sort,
  order,
  onSortChange,
  canWrite,
  onEdit,
  onArchive,
}: ClientsTableProps) {
  const toggleSort = (key: ClientSortField) => {
    if (sort === key) onSortChange(key, order === 'asc' ? 'desc' : 'asc');
    else onSortChange(key, key === 'monthlyValue' ? 'desc' : 'asc');
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {COLUMNS.map((column) => {
            const isSorted = sort === column.key;
            const SortIcon = !isSorted ? ArrowUpDown : order === 'asc' ? ArrowUp : ArrowDown;
            return (
              <TableHead
                key={column.key}
                scope="col"
                aria-sort={isSorted ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}
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
          {canWrite ? (
            <TableHead scope="col" className="text-right">
              Ações
            </TableHead>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((client) => (
          <TableRow key={client.id} data-client-id={client.id}>
            <TableCell className="font-medium">
              <Link
                to={`/clients/${client.id}`}
                className="rounded-md underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {client.name}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">{client.externalCode ?? '—'}</TableCell>
            <TableCell>{client.segment ?? '—'}</TableCell>
            <TableCell>{client.size ?? '—'}</TableCell>
            <TableCell>
              {client.activeContract?.planName ?? (
                <span className="text-muted-foreground">
                  {client.activeContract ? 'sem plano' : 'sem contrato'}
                </span>
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {client.activeContract
                ? formatMoney(client.activeContract.monthlyValue, client.activeContract.currency)
                : '—'}
            </TableCell>
            <TableCell>
              <span
                className={cn(
                  'inline-flex h-5 items-center rounded-4xl border border-border px-2 text-xs font-medium whitespace-nowrap',
                  client.status !== 'active' && 'text-muted-foreground',
                )}
              >
                {CLIENT_STATUS_LABELS[client.status]}
              </span>
            </TableCell>
            {canWrite ? (
              <TableCell className="text-right">
                <span className="inline-flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onEdit(client)}
                    aria-label={`Editar ${client.name}`}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                  {client.status !== 'archived' ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onArchive(client)}
                      aria-label={`Arquivar ${client.name}`}
                    >
                      <Archive aria-hidden="true" />
                    </Button>
                  ) : null}
                </span>
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
