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
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      {/* Figuras proporcionais fora de tabela (DATAVIZ.md §2.2); encolhe no celular para caber. */}
      <div className="mt-1 text-2xl font-semibold tracking-tight whitespace-nowrap sm:text-3xl">
        {formatCount(value)}
      </div>
      {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
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
    <div className="space-y-6">
      {/* As quatro contagens numa superfície só (uma sombra, não quatro): duas por linha no
          celular, as quatro em fila do md em diante. */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 rounded-xl bg-card p-4 shadow-soft ring-1 ring-foreground/5 sm:gap-x-6 sm:p-5 md:grid-cols-4">
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
        <p className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive ring-1 ring-destructive/20">
          Campos obrigatórios sem coluna: <strong>{missing.join(', ')}</strong>. Volte ao mapeamento
          e escolha a coluna de cada um.
        </p>
      ) : null}

      {/* No celular ficam as colunas que contam a história (tabela, lidas, válidas); as demais
          voltam conforme a tela cresce, em vez de seis colunas espremidas. */}
      <section
        aria-labelledby="tabelas-titulo"
        className="overflow-hidden rounded-xl bg-card shadow-soft ring-1 ring-foreground/5"
      >
        <h4 id="tabelas-titulo" className="px-4 pt-4 pb-3 text-sm font-medium sm:px-5 sm:pt-5">
          Por tabela
        </h4>
        <Table aria-label="Contagens por tabela">
          <TableHeader>
            <TableRow>
              <TableHead>Tabela</TableHead>
              <TableHead className="hidden md:table-cell">Conjunto de dados</TableHead>
              <TableHead className="text-right">Lidas</TableHead>
              <TableHead className="text-right">Válidas</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Inválidas</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Duplicadas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.sheets.map((sheet) => (
              <TableRow key={sheet.sheet}>
                <TableCell className="font-medium">{sheet.sheet}</TableCell>
                <TableCell className="hidden md:table-cell">
                  {IMPORT_DATASET_LABELS[sheet.dataset]}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCount(sheet.counts.total)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCount(sheet.counts.valid)}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                  {formatCount(sheet.counts.invalid)}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                  {formatCount(sheet.counts.duplicates)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {preview.skipped.length > 0 ? (
        <section
          aria-labelledby="ignoradas-titulo"
          className="space-y-2 rounded-xl bg-card p-4 shadow-soft ring-1 ring-foreground/5 sm:p-5"
        >
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
        <section
          aria-labelledby="erros-titulo"
          className="overflow-hidden rounded-xl bg-card shadow-soft ring-1 ring-foreground/5"
        >
          <h4 id="erros-titulo" className="px-4 pt-4 pb-3 text-sm font-medium sm:px-5 sm:pt-5">
            Erros por linha ({formatCount(preview.errorCount)})
          </h4>
          {/* O que importa no celular é a linha e o motivo; tabela e campo voltam nas telas
              maiores. O motivo quebra em várias linhas em vez de esticar a tabela. */}
          <Table aria-label="Erros por linha">
            <TableHeader>
              <TableRow>
                <TableHead className="hidden md:table-cell">Tabela</TableHead>
                <TableHead className="text-right">Linha</TableHead>
                <TableHead className="hidden sm:table-cell">Campo</TableHead>
                <TableHead>O que houve</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {errors.map((error, index) => (
                <TableRow key={`${error.sheet}-${error.row}-${error.field ?? ''}-${index}`}>
                  <TableCell className="hidden md:table-cell">{error.sheet}</TableCell>
                  <TableCell className="text-right tabular-nums">{error.row}</TableCell>
                  <TableCell className="hidden sm:table-cell">{error.field ?? '—'}</TableCell>
                  <TableCell className="whitespace-normal">{error.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {preview.errorCount > errors.length ? (
            <p className="border-t border-border px-3 py-3 text-xs text-muted-foreground">
              Mostrando {formatCount(errors.length)} de {formatCount(preview.errorCount)} erros. A
              lista completa fica guardada na importação.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
