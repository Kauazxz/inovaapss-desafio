import { CircleCheck, TriangleAlert } from 'lucide-react';

import { IMPORT_DATASET_LABELS, IMPORT_MAPPING_SOURCE_LABELS } from '@inovaapss/shared';
import type { ImportSheetPreviewDto } from '@inovaapss/shared';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

import {
  FIELD_TYPE_LABELS,
  formatConfidence,
  HIGH_CONFIDENCE,
  MAPPING_REASON_LABELS,
} from './format';

interface MappingTableProps {
  sheet: ImportSheetPreviewDto;
  /** Todos os cabeçalhos do arquivo, para o seletor de coluna. */
  headers: readonly string[];
  /** Troca a coluna de um campo; `null` deixa o campo sem coluna. */
  onChange(field: string, header: string | null): void;
  disabled?: boolean;
}

/**
 * Coluna do arquivo → campo do conjunto de dados, com a confiança de cada escolha e a chance de
 * corrigir. O que a máquina adivinhou fica visível: obrigatório sem coluna aparece em destaque,
 * porque é o que trava a importação.
 */
export function MappingTable({ sheet, headers, onChange, disabled = false }: MappingTableProps) {
  const label = IMPORT_DATASET_LABELS[sheet.dataset];

  // A tabela vai de ponta a ponta do painel: assim a área que rola no celular é a largura
  // inteira do card, e não uma faixa com sobra dos dois lados.
  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-foreground/5">
      <div className="flex flex-col gap-1 px-4 pt-4 pb-3 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-2 sm:px-5 sm:pt-5">
        <h4 className="min-w-0 text-sm font-medium">
          {sheet.sheet} <span className="text-muted-foreground">→ {label}</span>
        </h4>
        <span className="text-xs text-muted-foreground">
          Mapeamento: {IMPORT_MAPPING_SOURCE_LABELS[sheet.mappingSource]}
        </span>
      </div>

      <Table aria-label={`Mapeamento da tabela ${sheet.sheet}`}>
        <TableHeader>
          <TableRow>
            <TableHead>Campo</TableHead>
            <TableHead>Coluna do arquivo</TableHead>
            <TableHead>Confiança</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sheet.fields.map((field) => {
            const faltando = field.required && field.header === null;
            const conferir = field.header !== null && field.confidence < HIGH_CONFIDENCE;
            return (
              <TableRow key={field.field} className={cn(faltando && 'bg-destructive/5')}>
                <TableCell className="whitespace-normal">
                  <div className="font-medium">
                    {field.label}
                    {field.required ? (
                      <span className="ml-1 text-destructive" aria-label="obrigatório">
                        *
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {FIELD_TYPE_LABELS[field.type] ?? field.type}
                  </div>
                </TableCell>
                <TableCell>
                  <label className="sr-only" htmlFor={`${sheet.sheet}-${field.field}`}>
                    Coluna para {field.label}
                  </label>
                  <select
                    id={`${sheet.sheet}-${field.field}`}
                    className="h-9 w-full max-w-40 rounded-lg border border-input bg-card px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:max-w-64"
                    value={field.header ?? ''}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange(field.field, event.target.value === '' ? null : event.target.value)
                    }
                  >
                    <option value="">— sem coluna —</option>
                    {headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </TableCell>
                <TableCell className="whitespace-normal">
                  {faltando ? (
                    <span className="inline-flex items-start gap-1.5 text-sm text-destructive">
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      obrigatório sem coluna
                    </span>
                  ) : field.header === null ? (
                    <span className="text-sm text-muted-foreground">não importado</span>
                  ) : (
                    <span
                      className={cn(
                        'inline-flex items-start gap-1.5 text-sm tabular-nums',
                        conferir ? 'text-muted-foreground' : 'text-foreground',
                      )}
                    >
                      {conferir ? (
                        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      ) : (
                        <CircleCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      )}
                      {formatConfidence(field.confidence)} · {MAPPING_REASON_LABELS[field.reason]}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {sheet.unmappedHeaders.length > 0 ? (
        <p className="border-t border-border px-3 py-3 text-xs text-muted-foreground">
          Colunas do arquivo que ninguém usou: {sheet.unmappedHeaders.join(', ')}.
        </p>
      ) : null}
    </div>
  );
}
