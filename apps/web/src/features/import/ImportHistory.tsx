import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { useImports } from './api';
import { formatCount, formatDateTime, formatFileSize, IMPORT_STATUS_LABELS } from './format';

const PAGE_SIZE = 10;

/** Últimas importações da organização: o que já entrou e o que ficou pelo caminho. */
export function ImportHistory() {
  const imports = useImports(1, PAGE_SIZE);

  if (imports.isPending) {
    return (
      <div aria-busy="true" aria-label="Carregando importações">
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (imports.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Não foi possível carregar as importações anteriores: {imports.error.message}
      </p>
    );
  }

  const items = imports.data?.items ?? [];
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma importação ainda. A primeira aparece aqui assim que você confirmar.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Arquivo</TableHead>
            <TableHead>Quando</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className="text-right">Linhas importadas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((job) => (
            <TableRow key={job.id}>
              <TableCell>
                <span className="font-medium">{job.fileName}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {job.fileType} · {formatFileSize(job.sizeBytes)}
                  {job.sheetName === null ? '' : ` · ${job.sheetName}`}
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {formatDateTime(job.confirmedAt ?? job.createdAt)}
              </TableCell>
              <TableCell>
                <Badge variant={job.status === 'done' ? 'secondary' : 'outline'}>
                  {IMPORT_STATUS_LABELS[job.status]}
                </Badge>
                {job.errorMessage === null ? null : (
                  <span className="mt-0.5 block text-xs text-destructive">{job.errorMessage}</span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {job.status === 'done' ? formatCount(job.rowsImported) : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
