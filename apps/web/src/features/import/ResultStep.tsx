import { CircleCheck, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { type ConfirmImportResult } from './api';
import { formatCount } from './format';

interface ResultStepProps {
  result: ConfirmImportResult;
  onRestart(): void;
}

/**
 * Passo 4: o que entrou de fato. Três informações, nesta ordem de importância: quantas linhas
 * foram gravadas, o que ficou de fora (e por quê) e se a carteira já foi recalculada (§62).
 */
export function ResultStep({ result, onRestart }: ResultStepProps) {
  const { imported, summary, recalculated } = result;
  const rejected = summary.invalid + summary.duplicates;

  return (
    <section className="space-y-6" aria-live="polite">
      <div className="flex items-start gap-3 rounded-xl border border-border px-4 py-3">
        <CircleCheck className="mt-0.5 size-5 shrink-0 text-foreground" aria-hidden="true" />
        <div>
          <h3 className="text-base font-semibold">
            {formatCount(imported.rows)}{' '}
            {imported.rows === 1 ? 'linha importada' : 'linhas importadas'} de {result.job.fileName}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatCount(imported.recordsCreated)}{' '}
            {imported.recordsCreated === 1 ? 'registro criado' : 'registros criados'} e{' '}
            {formatCount(imported.recordsUpdated)}{' '}
            {imported.recordsUpdated === 1 ? 'atualizado' : 'atualizados'}.
            {rejected > 0
              ? ` ${formatCount(rejected)} ${rejected === 1 ? 'linha ficou' : 'linhas ficaram'} de fora por erro de validação.`
              : ''}
          </p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {recalculated.ok
          ? `Carteira recalculada: ${formatCount(recalculated.clients ?? 0)} ${
              recalculated.clients === 1 ? 'cliente avaliado' : 'clientes avaliados'
            } com os dados novos.`
          : `Os dados foram gravados, mas a carteira não foi recalculada: ${recalculated.reason ?? 'motivo não informado'}`}
      </p>

      {imported.skipped.length > 0 ? (
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <TriangleAlert className="size-4 text-muted-foreground" aria-hidden="true" />
            {formatCount(imported.skipped.length)}{' '}
            {imported.skipped.length === 1 ? 'linha válida não' : 'linhas válidas não'} pôde ser
            gravada
          </h3>
          <div className="max-h-72 overflow-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Linha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {imported.skipped.map((item) => (
                  <TableRow key={`${item.row}-${item.externalCode}`}>
                    <TableCell className="tabular-nums">{item.row}</TableCell>
                    <TableCell>{item.externalCode}</TableCell>
                    <TableCell className="text-muted-foreground">{item.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/dashboard">Ver o dashboard</Link>
        </Button>
        <Button type="button" variant="outline" onClick={onRestart}>
          Importar outro arquivo
        </Button>
      </div>
    </section>
  );
}
