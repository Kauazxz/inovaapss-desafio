import { IMPORT_JOB_STATUS_LABELS } from '@inovaapss/shared';
import type { ImportJobDto } from '@inovaapss/shared';

import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

import { useImports } from './api';
import { formatCount, formatDateTime, formatFileSize } from './format';

/** Contagens do resumo guardado no job, quando já houve prévia ou confirmação. */
function summaryText(job: ImportJobDto): string {
  const summary = job.summary;
  if (summary === null) return '—';
  const result = summary.result;
  if (result !== undefined) {
    const partes = [
      `${formatCount(result.clientsCreated + result.clientsUpdated)} clientes`,
      `${formatCount(result.metricValues)} valores`,
    ];
    if (result.rowErrors > 0) partes.push(`${formatCount(result.rowErrors)} erros`);
    return partes.join(' · ');
  }
  return `${formatCount(summary.counts.valid)} válidas de ${formatCount(summary.counts.total)}`;
}

/**
 * O que já foi importado: data, arquivo, quem fez, contagens e situação. É o que responde
 * "de onde vieram estes dados?" meses depois.
 */
export function ImportHistory() {
  const imports = useImports({ page: 1, pageSize: 20 });

  if (imports.isPending) {
    return (
      <div role="status" aria-label="Carregando o histórico" className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (imports.isError) {
    const message =
      imports.error instanceof Error
        ? imports.error.message
        : 'Não foi possível carregar o histórico.';
    return (
      <p role="alert" className="text-sm text-destructive">
        {message}
      </p>
    );
  }

  const items = imports.data?.items ?? [];
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma importação ainda. A primeira aparece aqui assim que você enviar um arquivo.
      </p>
    );
  }

  return (
    <Table aria-label="Importações anteriores">
      <TableHeader>
        <TableRow>
          <TableHead>Quando</TableHead>
          <TableHead>Arquivo</TableHead>
          <TableHead>Tamanho</TableHead>
          <TableHead>Resultado</TableHead>
          <TableHead>Situação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((job) => (
          <TableRow key={job.id}>
            <TableCell className="whitespace-nowrap">{formatDateTime(job.createdAt)}</TableCell>
            <TableCell className="font-medium">
              {job.fileName}
              <span className="ml-2 text-xs text-muted-foreground">{job.fileType}</span>
            </TableCell>
            <TableCell className="tabular-nums">{formatFileSize(job.sizeBytes)}</TableCell>
            <TableCell>{summaryText(job)}</TableCell>
            <TableCell>
              <span
                className={cn(
                  'rounded-full border border-border px-2 py-0.5 text-xs',
                  job.status === 'confirmed' && 'border-transparent bg-muted',
                  job.status === 'failed' && 'border-destructive/40 text-destructive',
                )}
              >
                {IMPORT_JOB_STATUS_LABELS[job.status]}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
