import { CircleAlert, CircleCheck } from 'lucide-react';
import { useId, useState } from 'react';

import { Badge } from '@/components/ui/badge';
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

import { type DatasetSuggestion, type PreviewImportResult } from './api';
import { formatCell, formatCount, IMPORT_ERROR_LABELS } from './format';

interface PreviewStepProps {
  result: PreviewImportResult;
  /** Campos do dataset escolhido, para dar nome ao campo de cada erro. */
  suggestion: DatasetSuggestion | undefined;
  onBack(): void;
  onConfirm(ignoreInvalidRows: boolean): void;
  confirming: boolean;
  error: string | null;
}

function Tile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'good' | 'bad';
}) {
  return (
    <div className="rounded-xl border border-border px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-xl font-semibold tabular-nums',
          tone === 'good' && 'text-foreground',
          tone === 'bad' && value > 0 && 'text-destructive',
        )}
      >
        {formatCount(value)}
      </p>
    </div>
  );
}

/**
 * Passo 3 (§34): o que entra, o que não entra e por quê — antes de gravar qualquer coisa.
 *
 * A prévia é a última parada antes da confirmação, então ela precisa responder três perguntas
 * sem rolagem: quantas linhas estão boas, o que exatamente está errado (linha, campo e motivo em
 * português) e como os dados vão ficar depois de convertidos.
 */
export function PreviewStep({
  result,
  suggestion,
  onBack,
  onConfirm,
  confirming,
  error,
}: PreviewStepProps) {
  const ignoreId = useId();
  const [ignoreInvalid, setIgnoreInvalid] = useState(false);
  const { summary, errors, sampleRows } = result;

  const rejected = summary.invalid + summary.duplicates;
  const labelOfField = (field: string | null): string => {
    if (field === null) return 'Linha inteira';
    return suggestion?.fields.find((item) => item.field === field)?.label ?? field;
  };
  const sampleColumns = Object.keys(sampleRows[0] ?? {});
  const blocked = summary.valid === 0 || (rejected > 0 && !ignoreInvalid);

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Linhas lidas" value={summary.total} />
        <Tile label="Prontas para importar" value={summary.valid} tone="good" />
        <Tile label="Com erro" value={summary.invalid} tone="bad" />
        <Tile label="Repetidas" value={summary.duplicates} tone="bad" />
      </div>

      {summary.missingFields.length > 0 ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Sem coluna para {summary.missingFields.map(labelOfField).join(', ')}. Volte ao
            mapeamento e escolha a coluna — sem ela, nenhuma linha entra.
          </span>
        </p>
      ) : null}

      {rejected === 0 ? (
        <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
          <CircleCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          Todas as {formatCount(summary.valid)} linhas passaram na validação.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">
              {formatCount(rejected)} {rejected === 1 ? 'linha recusada' : 'linhas recusadas'}
            </h3>
            {summary.errorCount > errors.length ? (
              <p className="text-xs text-muted-foreground">
                Mostrando os {formatCount(errors.length)} primeiros de{' '}
                {formatCount(summary.errorCount)} problemas.
              </p>
            ) : null}
          </div>
          <div className="max-h-96 overflow-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Linha</TableHead>
                  <TableHead>Campo</TableHead>
                  <TableHead>Problema</TableHead>
                  <TableHead>O que fazer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors.map((item, index) => (
                  <TableRow key={`${item.row}-${item.field ?? 'linha'}-${index}`}>
                    <TableCell className="tabular-nums">{item.row}</TableCell>
                    <TableCell>{labelOfField(item.field)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{IMPORT_ERROR_LABELS[item.code]}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            A contagem de linhas é a do arquivo depois do cabeçalho: linha 1 é a primeira com dados.
          </p>
        </div>
      )}

      {sampleRows.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Como os dados vão ficar</h3>
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  {sampleColumns.map((column) => (
                    <TableHead key={column} className="whitespace-nowrap">
                      {labelOfField(column)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sampleRows.map((row, index) => (
                  <TableRow key={index}>
                    {sampleColumns.map((column) => (
                      <TableCell key={column} className="whitespace-nowrap">
                        {formatCell(row[column])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}

      {error === null ? null : (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={onBack}>
          Voltar ao mapeamento
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          {rejected > 0 && summary.valid > 0 ? (
            <label htmlFor={ignoreId} className="flex items-center gap-2 text-sm">
              <input
                id={ignoreId}
                type="checkbox"
                className="size-4 rounded border-border"
                checked={ignoreInvalid}
                onChange={(event) => setIgnoreInvalid(event.target.checked)}
              />
              Importar assim mesmo as {formatCount(summary.valid)} linhas boas
            </label>
          ) : null}
          <Button
            type="button"
            onClick={() => onConfirm(ignoreInvalid)}
            disabled={confirming || blocked}
          >
            {confirming
              ? 'Importando…'
              : `Importar ${formatCount(summary.valid)} ${summary.valid === 1 ? 'linha' : 'linhas'}`}
          </Button>
        </div>
      </div>
      {summary.valid === 0 ? (
        <p className="text-right text-xs text-muted-foreground">
          Nenhuma linha passou na validação: corrija o arquivo ou o mapeamento.
        </p>
      ) : null}
    </section>
  );
}
