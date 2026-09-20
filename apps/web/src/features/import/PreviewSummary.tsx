import { IMPORT_DATASET_LABELS } from '@inovaapss/shared';
import type { ImportPreviewDto, ImportRowErrorDto } from '@inovaapss/shared';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { formatCount } from './format';

/** Um número grande com o rótulo embaixo (§57: número primeiro, explicação depois). */
function Count({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-3xl font-semibold tabular-nums">{formatCount(value)}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

/**
 * O que §34 manda mostrar antes de gravar: válidas, inválidas, duplicidades, campos ausentes e
 * os erros por linha. Sem isto a importação seria um salto no escuro.
 */
export function PreviewSummary({ preview }: { preview: ImportPreviewDto }) {
  const errors: ImportRowErrorDto[] = preview.sheets.flatMap((sheet) => sheet.errors);
  const missing = preview.counts.missingFields;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-8 border-b border-border pb-6 md:grid-cols-4">
        <Count label="Linhas lidas" value={preview.counts.total} />
        <Count label="Válidas" value={preview.counts.valid} hint="serão gravadas" />
        <Count label="Inválidas" value={preview.counts.invalid} hint="ficam de fora" />
        <Count
          label="Duplicadas"
          value={preview.counts.duplicates}
          hint="a primeira ocorrência fica"
        />
      </div>

      {missing.length > 0 ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          Campos obrigatórios sem coluna: <strong>{missing.join(', ')}</strong>. Volte ao mapeamento
          e escolha a coluna de cada um.
        </p>
      ) : null}

      <section aria-labelledby="tabelas-titulo" className="space-y-3">
        <h4 id="tabelas-titulo" className="text-sm font-medium">
          Por tabela
        </h4>
        <Table aria-label="Contagens por tabela">
          <TableHeader>
            <TableRow>
              <TableHead>Tabela</TableHead>
              <TableHead>Conjunto de dados</TableHead>
              <TableHead className="text-right">Lidas</TableHead>
              <TableHead className="text-right">Válidas</TableHead>
              <TableHead className="text-right">Inválidas</TableHead>
              <TableHead className="text-right">Duplicadas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.sheets.map((sheet) => (
              <TableRow key={sheet.sheet}>
                <TableCell className="font-medium">{sheet.sheet}</TableCell>
                <TableCell>{IMPORT_DATASET_LABELS[sheet.dataset]}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCount(sheet.counts.total)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCount(sheet.counts.valid)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCount(sheet.counts.invalid)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCount(sheet.counts.duplicates)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {preview.skipped.length > 0 ? (
        <section aria-labelledby="ignoradas-titulo" className="space-y-2">
          <h4 id="ignoradas-titulo" className="text-sm font-medium">
            Tabelas ignoradas
          </h4>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {preview.skipped.map((item) => (
              <li key={item.sheet}>
                <span className="font-medium text-foreground">{item.sheet}</span> — {item.reason}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {errors.length > 0 ? (
        <section aria-labelledby="erros-titulo" className="space-y-3">
          <h4 id="erros-titulo" className="text-sm font-medium">
            Erros por linha ({formatCount(preview.errorCount)})
          </h4>
          <Table aria-label="Erros por linha">
            <TableHeader>
              <TableRow>
                <TableHead>Tabela</TableHead>
                <TableHead className="text-right">Linha</TableHead>
                <TableHead>Campo</TableHead>
                <TableHead>O que houve</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {errors.map((error, index) => (
                <TableRow key={`${error.sheet}-${error.row}-${error.field ?? ''}-${index}`}>
                  <TableCell>{error.sheet}</TableCell>
                  <TableCell className="text-right tabular-nums">{error.row}</TableCell>
                  <TableCell>{error.field ?? '—'}</TableCell>
                  <TableCell>{error.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {preview.errorCount > errors.length ? (
            <p className="text-xs text-muted-foreground">
              Mostrando {formatCount(errors.length)} de {formatCount(preview.errorCount)} erros. A
              lista completa fica guardada na importação.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
