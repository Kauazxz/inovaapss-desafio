/**
 * A faixa do modelo, no alto da tabela: qual modelo manda, que versão está em vigor, quanto os
 * pesos somam e o que ainda não foi publicado.
 *
 * Era uma tela inteira (/metric-models). Virou esta faixa porque quem mexe em peso e ordem está
 * olhando para as métricas, não para uma lista de modelos: a versão é o meio, não o assunto.
 */
import { Scale, SlidersHorizontal } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router';

import type { VersionWeightsResult } from '@inovaapss/validation';

import { Button } from '@/components/ui/button';
import { selectClassName } from '@/features/metric-models/fields';
import { percent } from '@/features/metric-models/format';
import { cn } from '@/lib/utils';

export interface ModelBarProps {
  models: readonly { id: string; name: string }[];
  modelId: string | null;
  onSelectModel: (modelId: string) => void;
  /** Versão em vigor e rascunho já aberto no servidor (pela configuração avançada). */
  activeVersion: number | null;
  draftVersion: number | null;
  /** Soma dos pesos do que está na tela; `null` enquanto o modelo carrega. */
  check: VersionWeightsResult | null;
  /** Uma frase por mudança ainda não publicada. */
  changes: readonly string[];
  publishing: boolean;
  error: string | null;
  onPublish: () => void;
  onDiscard: () => void;
  loading: boolean;
}

const MAX_CHANGES = 5;

export function ModelBar({
  models,
  modelId,
  onSelectModel,
  activeVersion,
  draftVersion,
  check,
  changes,
  publishing,
  error,
  onPublish,
  onDiscard,
  loading,
}: ModelBarProps) {
  const selectId = useId();
  const model = models.find((candidate) => candidate.id === modelId) ?? null;
  const dirty = changes.length > 0;

  if (!loading && model === null) {
    return (
      <section
        aria-label="Modelo de métricas"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border px-4 py-3"
      >
        <div>
          <p className="text-sm font-medium">Nenhum modelo de métricas ainda</p>
          <p className="text-xs text-muted-foreground">
            O modelo é quem guarda peso, ordem e normalização. Sem ele, a tabela só cadastra
            métricas.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/metric-models">
            <Scale aria-hidden="true" />
            Criar o modelo
          </Link>
        </Button>
      </section>
    );
  }

  return (
    <section
      aria-label="Modelo de métricas"
      className={cn(
        'rounded-xl border px-4 py-3',
        dirty ? 'border-primary bg-primary/5' : 'border-border bg-muted/30',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {models.length > 1 ? (
              <>
                <label htmlFor={selectId} className="sr-only">
                  Modelo de métricas
                </label>
                <select
                  id={selectId}
                  className={cn(selectClassName, 'h-8 w-auto')}
                  value={modelId ?? ''}
                  onChange={(event) => onSelectModel(event.target.value)}
                >
                  {models.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <p className="text-sm font-medium">{model?.name ?? 'Carregando o modelo…'}</p>
            )}
            <span className="text-sm text-muted-foreground">
              {activeVersion === null
                ? 'nenhuma versão em vigor'
                : `versão ${activeVersion} em vigor`}
            </span>
          </div>
          {/*
            A regra "peso e ordem só valem depois de publicar" mora junto da tabela, onde a
            pessoa mexe nisso. Aqui ficava repetida e empurrava a primeira métrica para baixo
            da dobra. Sobra o que é exclusivo desta barra: existe um rascunho aberto.
          */}
          {draftVersion === null ? null : (
            <p className="mt-1 text-xs text-muted-foreground">
              Há um rascunho v{draftVersion} em aberto; suas mudanças continuam a partir dele.
            </p>
          )}
        </div>

        {/* No celular a soma e o atalho quebram em linhas; a partir de sm ficam lado a lado. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:shrink-0">
          <p
            role="status"
            aria-label="Soma dos pesos"
            className={cn(
              'text-sm whitespace-nowrap',
              check !== null && !check.ok ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            Soma dos pesos:{' '}
            <strong className="tabular-nums">{check === null ? '…' : percent(check.total)}</strong>
          </p>
          {modelId === null ? null : (
            <Button asChild variant="ghost" size="sm">
              <Link to={`/metric-models/${modelId}`}>
                <SlidersHorizontal aria-hidden="true" />
                Configuração avançada
              </Link>
            </Button>
          )}
        </div>
      </div>

      {dirty ? (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-sm font-medium">
            {changes.length === 1
              ? '1 alteração esperando publicação'
              : `${changes.length} alterações esperando publicação`}
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {changes.slice(0, MAX_CHANGES).map((change) => (
              <li key={change}>· {change}</li>
            ))}
            {changes.length > MAX_CHANGES ? (
              <li>· e mais {changes.length - MAX_CHANGES}…</li>
            ) : null}
          </ul>
          {check !== null && !check.ok ? (
            <p className="mt-2 text-xs text-destructive">{check.message}</p>
          ) : null}
          {error === null ? null : (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {error}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={publishing || check === null || !check.ok}
              onClick={onPublish}
            >
              {publishing ? 'Publicando…' : 'Publicar alterações'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={publishing}
              onClick={onDiscard}
            >
              Descartar
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
