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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-medium">
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
                <TableCell>
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
                    className="h-8 w-full max-w-64 rounded-lg border border-border bg-background px-2 text-sm"
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
                <TableCell>
                  {faltando ? (
                    <span className="inline-flex items-center gap-1.5 text-sm text-destructive">
                      <TriangleAlert className="size-3.5" aria-hidden="true" />
                      obrigatório sem coluna
                    </span>
                  ) : field.header === null ? (
                    <span className="text-sm text-muted-foreground">não importado</span>
                  ) : (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 text-sm',
                        conferir ? 'text-muted-foreground' : 'text-foreground',
                      )}
                    >
                      {conferir ? (
                        <TriangleAlert className="size-3.5" aria-hidden="true" />
                      ) : (
                        <CircleCheck className="size-3.5" aria-hidden="true" />
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
        <p className="text-xs text-muted-foreground">
          Colunas do arquivo que ninguém usou: {sheet.unmappedHeaders.join(', ')}.
        </p>
      ) : null}
    </div>
  );
}
