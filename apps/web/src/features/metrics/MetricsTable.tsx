/**
 * A tabela do configurador (§41) com tudo editável no lugar: clicou no dado, mudou o dado.
 *
 * Duas origens convivem em cada linha e a pessoa não precisa distinguir:
 *   — Ativa, Métrica, Tipo e Direção são o CADASTRO: salvam na hora (PATCH /metrics/:id).
 *   — Ordem, Peso final e Normalização são o MODELO: entram num rascunho e só valem quando
 *     alguém publica, porque mudam o score de toda a carteira (§32).
 * Quem avisa disso é a faixa do modelo, acima da tabela, e a coluna Status, linha a linha.
 */
import { ChevronRight, GripVertical } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';

import {
  METRIC_DIRECTION_LABELS,
  METRIC_DIRECTIONS,
  METRIC_TYPE_LABELS,
  METRIC_TYPES,
  NORMALIZATION_STRATEGIES,
  NORMALIZATION_STRATEGY_LABELS,
  type NormalizationStrategy,
} from '@inovaapss/shared';
import type { UpdateMetricDefinitionBody } from '@inovaapss/validation';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { percentToWeight, weightToPercent } from '@/features/metric-models/draft';
import { percent, toNumber } from '@/features/metric-models/format';
import { cn } from '@/lib/utils';

import { BlockAction, BlockOptions, BlockTitle, InlineCell } from './inline-edit';

import type { MetricRow } from './model-draft';

// As colunas de apoio saem do caminho no celular (§8 do guia): sobra quem é a métrica, se está
// ativa e o peso final. A mesma classe vai no <TableHead> e no <TableCell> da coluna.
const FROM_MD = 'hidden md:table-cell';
const FROM_LG = 'hidden lg:table-cell';
const FROM_XL = 'hidden xl:table-cell';

/** Pílula "Sim/Não" para a coluna Ativa: texto sempre, cor nunca sozinha (DATAVIZ.md §1.4). */
export function ActivePill({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-full border border-border px-2 text-xs font-medium whitespace-nowrap',
        active ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      {active ? 'Sim' : 'Não'}
    </span>
  );
}

/** O que esta linha vai fazer quando alguém publicar. */
function statusOf(row: MetricRow, editing: boolean): string {
  const placement = row.definition.activePlacement;
  if (!row.definition.isActive) return 'Desativada — fora do cálculo';
  if (row.position === null) {
    return placement === null ? 'Fora do modelo' : 'Sai do modelo ao publicar';
  }
  if (placement === null) return 'Entra no modelo ao publicar';
  if (editing && row.weight !== null && Math.abs(placement.weight - row.weight) > 1e-9) {
    return 'Peso alterado — falta publicar';
  }
  return `No modelo ativo (${placement.modelName} · versão ${placement.version})`;
}

export interface MetricsTableActions {
  onDefinition: (id: string, patch: UpdateMetricDefinitionBody) => void;
  onWeight: (id: string, weight: number) => void;
  onInclude: (id: string, weight: number) => void;
  onExclude: (id: string) => void;
  onStrategy: (id: string, strategy: NormalizationStrategy) => void;
  onMoveTo: (fromId: string, toId: string) => void;
  onMoveBy: (id: string, delta: -1 | 1) => void;
}

export interface MetricsTableProps {
  rows: readonly MetricRow[];
  /** Há versão de modelo para editar peso, ordem e normalização? */
  canModel: boolean;
  /** Por que peso/ordem/normalização não estão editáveis agora. */
  modelHint: string;
  /** Arrastar exige a lista inteira na tela, sem filtro e sem paginação. */
  canOrder: boolean;
  orderHint: string;
  /** Quanto falta para os pesos fecharem 100 %, em fração (negativo = passou). */
  remaining: number;
  /** Métrica cujo cadastro está sendo salvo agora. */
  savingId: string | null;
  /** Já há edição de modelo em curso (muda o texto da coluna Status). */
  editing: boolean;
  actions: MetricsTableActions;
}

export function MetricsTable({
  rows,
  canModel,
  modelHint,
  canOrder,
  orderHint,
  remaining,
  savingId,
  editing,
  actions,
}: MetricsTableProps) {
  /** Só a alça arma o arrasto: a linha inteira arrastável atrapalha selecionar texto. */
  const [armedId, setArmedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const stopDrag = () => {
    setArmedId(null);
    setDragId(null);
    setOverId(null);
  };

  return (
    <Table aria-label="Métricas da organização">
      <TableHeader>
        <TableRow>
          <TableHead>Ativa</TableHead>
          <TableHead className={cn('text-right', FROM_MD)}>Ordem</TableHead>
          <TableHead>Métrica</TableHead>
          <TableHead className={FROM_LG}>Tipo</TableHead>
          <TableHead className="text-right">Peso final</TableHead>
          <TableHead className={FROM_LG}>Direção</TableHead>
          <TableHead className={FROM_XL}>Normalização</TableHead>
          <TableHead className={FROM_MD}>Status</TableHead>
          <TableHead>
            <span className="sr-only">Abrir</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const { definition } = row;
          const name = definition.name;
          const inModel = row.position !== null;
          const draggable = canOrder && inModel;
          const suggested = row.weight === null ? null : row.weight + remaining;

          return (
            <TableRow
              key={definition.id}
              data-metric-id={definition.id}
              draggable={armedId === definition.id}
              onDragStart={(event) => {
                setDragId(definition.id);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', definition.id);
              }}
              onDragOver={(event) => {
                if (dragId === null || dragId === definition.id || !draggable) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setOverId(definition.id);
              }}
              onDragLeave={() =>
                setOverId((current) => (current === definition.id ? null : current))
              }
              onDrop={(event) => {
                event.preventDefault();
                if (dragId !== null && dragId !== definition.id && draggable) {
                  actions.onMoveTo(dragId, definition.id);
                }
                stopDrag();
              }}
              onDragEnd={stopDrag}
              className={cn(
                'group/row',
                dragId === definition.id && 'opacity-40',
                overId === definition.id && 'ring-2 ring-primary ring-inset',
              )}
            >
              {/* Ativa — cadastro, salva na hora */}
              <TableCell>
                <InlineCell
                  label={`a situação de ${name}`}
                  pending={savingId === definition.id}
                  block={(close) => (
                    <>
                      <BlockTitle
                        title="A métrica está ativa?"
                        hint="Métrica desativada não entra no score nem na soma dos pesos."
                      />
                      <BlockOptions
                        value={definition.isActive ? 'sim' : 'nao'}
                        options={[
                          { value: 'sim', label: 'Sim, ativa' },
                          { value: 'nao', label: 'Não, desativada' },
                        ]}
                        onPick={(value) => {
                          actions.onDefinition(definition.id, { isActive: value === 'sim' });
                          close();
                        }}
                      />
                    </>
                  )}
                >
                  <ActivePill active={definition.isActive} />
                </InlineCell>
              </TableCell>

              {/* Ordem — modelo, arrastando pela alça */}
              <TableCell className={cn('text-right', FROM_MD)}>
                <div className="flex items-center justify-end gap-1">
                  {draggable ? (
                    /* A alça fica visível no que é toque (a coluna aparece a partir de md, e
                       tablet não tem hover); só no monitor ela espera o mouse chegar. */
                    <button
                      type="button"
                      aria-label={`Reordenar ${name}`}
                      title="Arraste para mudar a ordem, ou use as setas ↑ ↓"
                      onPointerDown={() => setArmedId(definition.id)}
                      onPointerUp={() => setArmedId(null)}
                      onKeyDown={(event) => {
                        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                        event.preventDefault();
                        actions.onMoveBy(definition.id, event.key === 'ArrowUp' ? -1 : 1);
                      }}
                      className="cursor-grab rounded-md p-1 text-muted-foreground opacity-70 outline-none transition-opacity hover:bg-muted focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing lg:opacity-0 lg:group-hover/row:opacity-70"
                    >
                      <GripVertical className="size-3.5" aria-hidden="true" />
                    </button>
                  ) : inModel ? (
                    <span className="sr-only">{orderHint}</span>
                  ) : null}
                  <span className="tabular-nums">{row.position ?? '—'}</span>
                </div>
              </TableCell>

              {/* Métrica — cadastro (nome), salva na hora */}
              <TableCell className="min-w-40 whitespace-normal">
                <InlineCell
                  label={`o nome de ${name}`}
                  pending={savingId === definition.id}
                  block={(close) => (
                    <>
                      <BlockTitle title="Nome da métrica" hint={`Chave: ${definition.slug}`} />
                      <BlockInputName
                        current={name}
                        onSubmit={(value) => {
                          actions.onDefinition(definition.id, { name: value });
                          close();
                        }}
                      />
                      <div className="mt-2 border-t border-border pt-2">
                        <Link
                          to={`/metrics/${definition.id}`}
                          className="block rounded-lg px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent"
                        >
                          Abrir a métrica →
                        </Link>
                      </div>
                    </>
                  )}
                >
                  <span className="font-medium">{name}</span>
                </InlineCell>
                <span className="block px-2 text-xs text-muted-foreground">{definition.slug}</span>
              </TableCell>

              {/* Tipo — cadastro, salva na hora */}
              <TableCell className={FROM_LG}>
                <InlineCell
                  label={`o tipo de ${name}`}
                  pending={savingId === definition.id}
                  block={(close) => (
                    <>
                      <BlockTitle
                        title="Tipo da métrica"
                        hint="O tipo diz que número é esse — e muda a leitura em toda a tela."
                      />
                      <BlockOptions
                        value={definition.metricType}
                        options={METRIC_TYPES.map((type) => ({
                          value: type,
                          label: METRIC_TYPE_LABELS[type],
                        }))}
                        onPick={(metricType) => {
                          actions.onDefinition(definition.id, { metricType });
                          close();
                        }}
                      />
                    </>
                  )}
                >
                  {METRIC_TYPE_LABELS[definition.metricType]}
                </InlineCell>
              </TableCell>

              {/* Peso final — modelo, entra no rascunho */}
              <TableCell className="text-right">
                <InlineCell
                  right
                  align="end"
                  label={`o peso de ${name}`}
                  disabled={!canModel}
                  disabledHint={modelHint}
                  block={(close) =>
                    inModel ? (
                      <>
                        <BlockTitle
                          title={`Peso de ${name}`}
                          hint={weightHint(remaining, suggested)}
                        />
                        <BlockWeight
                          current={row.weight ?? 0}
                          submitLabel="Aplicar"
                          onSubmit={(weight) => {
                            actions.onWeight(definition.id, weight);
                            close();
                          }}
                          extra={
                            <BlockAction
                              destructive
                              onClick={() => {
                                actions.onExclude(definition.id);
                                close();
                              }}
                            >
                              Tirar do modelo
                            </BlockAction>
                          }
                        />
                      </>
                    ) : (
                      <>
                        <BlockTitle
                          title={`${name} está fora do modelo`}
                          hint="Digite um peso para incluir esta métrica no cálculo do score."
                        />
                        <BlockWeight
                          current={0}
                          submitLabel="Incluir no modelo"
                          onSubmit={(weight) => {
                            actions.onInclude(definition.id, weight);
                            close();
                          }}
                        />
                      </>
                    )
                  }
                >
                  {row.weight === null ? '—' : percent(row.weight)}
                </InlineCell>
              </TableCell>

              {/* Direção — cadastro, salva na hora */}
              <TableCell className={FROM_LG}>
                <InlineCell
                  label={`a direção de ${name}`}
                  pending={savingId === definition.id}
                  block={(close) => (
                    <>
                      <BlockTitle
                        title="Para onde é bom ir?"
                        hint="É o que decide se subir é melhora ou piora."
                      />
                      <BlockOptions
                        value={definition.direction}
                        options={METRIC_DIRECTIONS.map((direction) => ({
                          value: direction,
                          label: METRIC_DIRECTION_LABELS[direction],
                        }))}
                        onPick={(direction) => {
                          actions.onDefinition(definition.id, { direction });
                          close();
                        }}
                      />
                    </>
                  )}
                >
                  {METRIC_DIRECTION_LABELS[definition.direction]}
                </InlineCell>
              </TableCell>

              {/* Normalização — modelo, entra no rascunho */}
              <TableCell className={FROM_XL}>
                <InlineCell
                  label={`a normalização de ${name}`}
                  disabled={!canModel || !inModel}
                  disabledHint={
                    inModel ? modelHint : 'A normalização existe quando a métrica está no modelo.'
                  }
                  block={(close) => (
                    <>
                      <BlockTitle
                        title="Como o valor vira saúde de 0 a 100"
                        hint="Os detalhes (faixas, metas, janelas) ficam na configuração avançada."
                      />
                      <BlockOptions
                        value={row.strategy}
                        options={NORMALIZATION_STRATEGIES.map((strategy) =>
                          // Uma regra JSON Logic não se escolhe numa lista: essa fica no painel.
                          strategy === 'CUSTOM_SAFE_RULE' && row.strategy !== 'CUSTOM_SAFE_RULE'
                            ? {
                                value: strategy,
                                label: NORMALIZATION_STRATEGY_LABELS[strategy],
                                disabled: true,
                                hint: 'Só pela configuração avançada.',
                              }
                            : { value: strategy, label: NORMALIZATION_STRATEGY_LABELS[strategy] },
                        )}
                        onPick={(strategy) => {
                          actions.onStrategy(definition.id, strategy);
                          close();
                        }}
                      />
                    </>
                  )}
                >
                  {row.strategy === null ? '—' : NORMALIZATION_STRATEGY_LABELS[row.strategy]}
                </InlineCell>
              </TableCell>

              <TableCell className={cn('text-muted-foreground', FROM_MD)}>
                {statusOf(row, editing)}
              </TableCell>

              <TableCell className="text-right">
                <Link
                  to={`/metrics/${definition.id}`}
                  aria-label={`Abrir ${name}`}
                  className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Link>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** "Faltam 2 %…" — o que ainda precisa acontecer para a soma fechar 100 % (§41). */
function weightHint(remaining: number, suggested: number | null): string {
  if (Math.abs(remaining) < 1e-9) return 'Os pesos fecham 100 %.';
  const gap =
    remaining > 0
      ? `Faltam ${percent(remaining)} para fechar 100 %.`
      : `Os pesos passaram ${percent(-remaining)} de 100 %.`;
  if (suggested === null || suggested < 0) return gap;
  return `${gap} Este peso fecharia a conta em ${percent(suggested)}.`;
}

/**
 * Campo de peso: começa vazio, com o valor de hoje como marca-d'água — digitar já substitui,
 * sem precisar apagar o número antigo.
 */
function BlockWeight({
  current,
  onSubmit,
  submitLabel,
  extra,
}: {
  current: number;
  onSubmit: (weight: number) => void;
  submitLabel: string;
  extra?: ReactNode;
}) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        const value = toNumber(typed);
        if (value === undefined || Number.isNaN(value)) {
          setError('Digite um número.');
          return;
        }
        if (value < 0 || value > 100) {
          setError('O peso vai de 0 a 100 %.');
          return;
        }
        onSubmit(percentToWeight(value));
      }}
    >
      <div className="flex items-center gap-2">
        <input
          autoFocus
          type="text"
          inputMode="decimal"
          aria-label="Novo peso em porcentagem"
          aria-invalid={error !== null}
          value={typed}
          placeholder={String(weightToPercent(current))}
          onChange={(event) => {
            setTyped(event.target.value);
            setError(null);
          }}
          className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm tabular-nums outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30"
        />
        <span className="text-sm text-muted-foreground">%</span>
      </div>
      {error === null ? null : (
        <p role="alert" className="px-1 text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <div>{extra}</div>
        <button
          type="submit"
          className="h-8 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

/** Campo de nome: mesma ideia do peso — vazio, com o nome de hoje como marca-d'água. */
function BlockInputName({
  current,
  onSubmit,
}: {
  current: string;
  onSubmit: (name: string) => void;
}) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        const value = typed.trim();
        if (value.length < 2) {
          setError('O nome precisa ter pelo menos 2 caracteres.');
          return;
        }
        onSubmit(value);
      }}
    >
      <input
        autoFocus
        type="text"
        aria-label="Novo nome da métrica"
        aria-invalid={error !== null}
        value={typed}
        placeholder={current}
        onChange={(event) => {
          setTyped(event.target.value);
          setError(null);
        }}
        className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30"
      />
      {error === null ? null : (
        <p role="alert" className="px-1 text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <button
          type="submit"
          className="h-8 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Salvar nome
        </button>
      </div>
    </form>
  );
}
