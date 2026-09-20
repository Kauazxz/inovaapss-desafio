import { Check, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { SuggestionStatusBadge } from './DocumentStatusBadge';
import { formatWeight, METRIC_DIRECTION_LABELS, METRIC_TYPE_LABELS } from './format';

import type { MetricSuggestion } from './api';

interface SuggestionsTableProps {
  suggestions: MetricSuggestion[];
  onAccept(suggestion: MetricSuggestion): void;
  onReject(suggestion: MetricSuggestion): void;
  busyId?: string | null;
}

function providerLabel(provider: string): string {
  if (provider === 'manual') return 'Manual';
  if (provider === 'anthropic') return 'Claude';
  if (provider === 'automatic-local') return 'Análise local';
  return provider;
}

function thresholdLabel(suggestion: MetricSuggestion): string | null {
  const thresholds = suggestion.suggestedThresholds;
  if (!thresholds) return null;
  if (thresholds.strategy === 'THRESHOLD_BANDS' && thresholds.bands) {
    return `Faixas: ${thresholds.bands
      .map((band) => `${band.upTo === null ? 'restante' : `até ${band.upTo}`} → ${band.health}`)
      .join(' · ')}`;
  }
  if (typeof thresholds.target === 'number') return `Meta sugerida: ${thresholds.target}`;
  if (typeof thresholds.min === 'number' || typeof thresholds.max === 'number') {
    return `Faixa sugerida: ${thresholds.min ?? '—'} a ${thresholds.max ?? '—'}`;
  }
  return thresholds.strategy ? `Estratégia: ${thresholds.strategy}` : null;
}

/**
 * Sugestões do documento (§35: revisão humana). Aceitar leva a /metrics com o payload
 * pré-preenchido; rejeitar só marca. Sugestão aceita continua com "Criar métrica" para o caso
 * de a pessoa ter saído da tela antes de confirmar.
 */
export function SuggestionsTable({
  suggestions,
  onAccept,
  onReject,
  busyId,
}: SuggestionsTableProps) {
  // No celular ficam as três colunas que decidem: qual métrica, em que pé está e o que fazer.
  // Tipo, direção, peso e origem voltam conforme a tela cresce.
  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-soft ring-1 ring-foreground/5">
      <Table aria-label="Sugestões de métrica">
        <TableHeader>
          <TableRow>
            <TableHead>Métrica sugerida</TableHead>
            <TableHead className="hidden md:table-cell">Tipo</TableHead>
            <TableHead className="hidden lg:table-cell">Direção</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Peso</TableHead>
            <TableHead className="hidden lg:table-cell">Origem</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {suggestions.map((suggestion) => {
            const busy = busyId === suggestion.id;
            const thresholds = thresholdLabel(suggestion);
            return (
              <TableRow key={suggestion.id} data-suggestion-id={suggestion.id}>
                {/* A coluna que fica no celular precisa quebrar linha: aqui mora o texto longo. */}
                <TableCell className="max-w-xs align-top whitespace-normal">
                  <p className="font-medium">
                    {suggestion.suggestedName}
                    {suggestion.unit ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({suggestion.unit})
                      </span>
                    ) : null}
                  </p>
                  {suggestion.description ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{suggestion.description}</p>
                  ) : null}
                  {suggestion.sourceExcerpt ? (
                    <blockquote className="mt-1 border-l-2 border-border pl-2 text-xs text-muted-foreground italic">
                      “{suggestion.sourceExcerpt}”
                    </blockquote>
                  ) : null}
                  {thresholds ? (
                    <p className="mt-1 text-xs text-muted-foreground">{thresholds}</p>
                  ) : null}
                  {suggestion.suggestedFormula ? (
                    <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                      Fórmula: {JSON.stringify(suggestion.suggestedFormula)}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="hidden align-top md:table-cell">
                  {METRIC_TYPE_LABELS[suggestion.suggestedType]}
                </TableCell>
                <TableCell className="hidden align-top lg:table-cell">
                  {METRIC_DIRECTION_LABELS[suggestion.suggestedDirection]}
                </TableCell>
                <TableCell className="hidden text-right align-top tabular-nums sm:table-cell">
                  {formatWeight(suggestion.suggestedWeight)}
                </TableCell>
                <TableCell className="hidden align-top text-muted-foreground lg:table-cell">
                  <span>{providerLabel(suggestion.provider)}</span>
                  {suggestion.confidence !== null ? (
                    <span className="block text-xs tabular-nums">
                      {Math.round(suggestion.confidence * 100)}% de confiança
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="align-top">
                  <SuggestionStatusBadge status={suggestion.status} />
                </TableCell>
                <TableCell className="text-right align-top">
                  {/* Duas ações lado a lado; sem espaço, uma cai para baixo da outra. */}
                  <div className="flex flex-wrap justify-end gap-1">
                    {suggestion.status !== 'rejected' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => onAccept(suggestion)}
                        aria-label={`${suggestion.status === 'accepted' ? 'Criar métrica' : 'Aceitar'} ${suggestion.suggestedName}`}
                      >
                        <Check aria-hidden="true" />
                        {suggestion.status === 'accepted' ? 'Criar métrica' : 'Aceitar'}
                      </Button>
                    ) : null}
                    {suggestion.status === 'pending' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => onReject(suggestion)}
                        aria-label={`Rejeitar ${suggestion.suggestedName}`}
                      >
                        <X aria-hidden="true" />
                        Rejeitar
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
