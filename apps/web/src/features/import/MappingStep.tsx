import { CircleAlert, TriangleAlert } from 'lucide-react';
import { useId, useMemo, useState } from 'react';

import type { ImportMapping } from '@inovaapss/validation';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { type DatasetCatalogItem, type ImportSheet } from './api';
import { formatConfidence, formatCount } from './format';

/** Acima disto a sugestão é confiável o bastante para não pedir revisão (HIGH_CONFIDENCE). */
const HIGH_CONFIDENCE = 0.9;

const NO_COLUMN = '';

interface MappingStepProps {
  sheets: ImportSheet[];
  sheetName: string;
  onSheetChange(name: string): void;
  dataset: string;
  onDatasetChange(dataset: string): void;
  mapping: ImportMapping;
  onMappingChange(mapping: ImportMapping): void;
  catalog: DatasetCatalogItem[] | undefined;
  onBack(): void;
  onPreview(): void;
  previewing: boolean;
  error: string | null;
}

/**
 * Passo 2 (§34): que tabela do arquivo, que tipo de dado e qual coluna alimenta cada campo.
 *
 * A API já chega com tudo sugerido — a pessoa confere e corrige. O que a tela precisa deixar
 * claro: o que foi adivinhado com pouca confiança, o que ficou sem coluna e o que é obrigatório.
 */
export function MappingStep({
  sheets,
  sheetName,
  onSheetChange,
  dataset,
  onDatasetChange,
  mapping,
  onMappingChange,
  catalog,
  onBack,
  onPreview,
  previewing,
  error,
}: MappingStepProps) {
  const sheetId = useId();
  const datasetId = useId();
  const [showSample, setShowSample] = useState(false);

  const sheet = sheets.find((item) => item.name === sheetName) ?? sheets[0];
  const suggestion = sheet?.suggestions.find((item) => item.dataset === dataset);
  const catalogItem = catalog?.find((item) => item.key === dataset);

  const fieldTypes = useMemo(() => {
    const map = new Map<string, { type: string; description?: string }>();
    for (const field of catalogItem?.fields ?? []) {
      map.set(field.key, {
        type: field.type,
        ...(field.description === undefined ? {} : { description: field.description }),
      });
    }
    return map;
  }, [catalogItem]);

  if (sheet === undefined || suggestion === undefined) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Não foi possível ler as tabelas deste arquivo. Envie o arquivo novamente.
      </p>
    );
  }

  const missingRequired = suggestion.fields.filter(
    (field) => field.required && (mapping[field.field] ?? null) === null,
  );

  // Duas colunas iguais em campos diferentes quase sempre é engano de quem está mapeando.
  const usedHeaders = new Map<string, string[]>();
  for (const field of suggestion.fields) {
    const header = mapping[field.field] ?? null;
    if (header === null) continue;
    usedHeaders.set(header, [...(usedHeaders.get(header) ?? []), field.label]);
  }
  const repeated = [...usedHeaders.entries()].filter(([, fields]) => fields.length > 1);

  const setField = (field: string, header: string) => {
    onMappingChange({ ...mapping, [field]: header === NO_COLUMN ? null : header });
  };

  return (
    <section className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={sheetId}>Tabela do arquivo</Label>
          <select
            id={sheetId}
            className="h-8 w-full rounded-lg border border-border bg-background px-2 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            value={sheet.name}
            onChange={(event) => onSheetChange(event.target.value)}
          >
            {sheets.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name} ({formatCount(item.rowCount)} {item.rowCount === 1 ? 'linha' : 'linhas'}
                )
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={datasetId}>Tipo de dado</Label>
          <select
            id={datasetId}
            className="h-8 w-full rounded-lg border border-border bg-background px-2 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            value={dataset}
            onChange={(event) => onDatasetChange(event.target.value)}
          >
            {sheet.suggestions.map((item) => (
              <option key={item.dataset} value={item.dataset}>
                {item.label}
                {item.confidence > 0 ? ` — ${formatConfidence(item.confidence)} de certeza` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {catalogItem === undefined ? null : (
        <p className="text-sm text-muted-foreground">
          {catalogItem.description} Uma linha é identificada por{' '}
          <strong className="font-medium text-foreground">
            {catalogItem.naturalKey
              .map((key) => catalogItem.fields.find((field) => field.key === key)?.label ?? key)
              .join(' + ')}
          </strong>
          : reimportar o mesmo arquivo atualiza, não duplica.
        </p>
      )}

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">De onde vem cada campo</h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowSample(!showSample)}
          >
            {showSample ? 'Ocultar' : 'Ver'} as primeiras linhas do arquivo
          </Button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campo</TableHead>
                <TableHead>Coluna do arquivo</TableHead>
                <TableHead>Como foi sugerido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suggestion.fields.map((field) => {
                const header = mapping[field.field] ?? null;
                const missing = field.required && header === null;
                const info = fieldTypes.get(field.field);
                return (
                  <TableRow key={field.field}>
                    <TableCell>
                      <span className="font-medium">{field.label}</span>
                      {field.required ? (
                        <span className="ml-1 text-destructive" aria-label="obrigatório">
                          *
                        </span>
                      ) : null}
                      {info?.description === undefined ? null : (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {info.description}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <select
                        className="h-8 w-full min-w-48 rounded-lg border border-border bg-background px-2 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-invalid:border-destructive"
                        aria-label={`Coluna para ${field.label}`}
                        aria-invalid={missing}
                        value={header ?? NO_COLUMN}
                        onChange={(event) => setField(field.field, event.target.value)}
                      >
                        <option value={NO_COLUMN}>— sem coluna —</option>
                        {sheet.headers.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell>
                      {header === null ? (
                        <span className="text-xs text-muted-foreground">
                          {field.required ? 'Escolha a coluna' : 'Não será importado'}
                        </span>
                      ) : field.header === header && field.confidence >= HIGH_CONFIDENCE ? (
                        <Badge variant="outline">
                          Sugerido ({formatConfidence(field.confidence)})
                        </Badge>
                      ) : field.header === header ? (
                        <Badge variant="secondary">
                          Confira ({formatConfidence(field.confidence)})
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Escolhido por você</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {showSample ? (
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                {sheet.headers.map((header) => (
                  <TableHead key={header}>{header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sheet.sampleRows.map((row, index) => (
                // A ordem das linhas do arquivo é a identidade delas aqui.
                <TableRow key={index}>
                  {sheet.headers.map((header) => (
                    <TableCell key={header} className="whitespace-nowrap">
                      {row[header] ?? '—'}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {suggestion.unmappedHeaders.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Colunas do arquivo que não serão usadas: {suggestion.unmappedHeaders.join(', ')}.
        </p>
      ) : null}

      {repeated.length > 0 ? (
        <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span>
            {repeated
              .map(([header, fields]) => `"${header}" está em ${fields.join(' e ')}`)
              .join('; ')}
            . Confira se é mesmo isso.
          </span>
        </p>
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
          Trocar de arquivo
        </Button>
        <div className="flex items-center gap-3">
          {missingRequired.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              Falta a coluna de: {missingRequired.map((field) => field.label).join(', ')}
            </span>
          ) : null}
          <Button type="button" onClick={onPreview} disabled={previewing}>
            {previewing ? 'Conferindo…' : 'Conferir a prévia'}
          </Button>
        </div>
      </div>
    </section>
  );
}
