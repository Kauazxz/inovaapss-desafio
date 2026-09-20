/**
 * A superfície de edição de UMA versão do modelo (§41): a tabela do documento (Ativa, Ordem,
 * Métrica, Tipo, Peso empresa, Peso sugerido, Peso final, Direção, Normalização, Status), a soma
 * dos pesos sempre visível e as ações — adicionar, reordenar, redistribuir, configurar, simular,
 * salvar e ativar.
 *
 * Só um RASCUNHO é editável (§32): versão ativa ou arquivada aparece aqui em leitura.
 *
 * O rascunho local nasce da versão recebida e não é ressincronizado depois. Quem monta este
 * componente passa uma `key` que muda quando o SERVIDOR muda a versão, e o React remonta com o
 * que foi salvo; um refetch que devolve o mesmo conteúdo não apaga a edição em andamento.
 */
import { ArrowDown, ArrowUp, Plus, Scale, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import {
  METRIC_DIRECTION_LABELS,
  METRIC_MODEL_VERSION_STATUS_LABELS,
  METRIC_TYPE_LABELS,
  NORMALIZATION_STRATEGY_LABELS,
  type MetricDefinitionDto,
  type MetricModelVersionDto,
  type RebalanceProposalDto,
} from '@inovaapss/shared';

import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

import { ActivateDialog } from './ActivateDialog';
import {
  useActivateMetricModelVersion,
  useRebalanceMetricModel,
  useUpdateMetricModelVersion,
} from './api';
import {
  applyRebalance,
  compareDraftWithVersion,
  draftToItems,
  moveDraftItem,
  newDraftItem,
  patchDraftItem,
  percentToWeight,
  versionToDraft,
  weightToPercent,
  weightsCheck,
  type DraftItem,
} from './draft';
import { selectClassName } from './fields';
import { percent } from './format';
import { ItemConfigPanel } from './ItemConfigPanel';
import { RebalancePanel } from './RebalancePanel';

function statusOf(
  item: DraftItem,
  definition: MetricDefinitionDto | undefined,
  activeWeight: number | undefined,
  editable: boolean,
): string {
  if (!item.included) return 'Fora desta versão';
  if (definition === undefined) return 'Métrica desconhecida';
  if (!definition.isActive) return 'Métrica desativada — fora do cálculo';
  if (!editable) return activeWeight === undefined ? 'Fora da versão ativa' : 'Em vigor';
  if (activeWeight === undefined) return 'Entra nesta versão';
  if (Math.abs(activeWeight - item.weight) > 1e-9) return 'Peso alterado';
  return 'Sem mudança';
}

/** Percentual digitado dentro dos limites do schema (0 a 100). */
function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export interface VersionEditorProps {
  modelId: string;
  version: MetricModelVersionDto;
  activeVersion: MetricModelVersionDto | null;
  definitions: MetricDefinitionDto[];
  /** Quantos clientes passam a ser pontuados pela versão ativada, quando a tela souber. */
  clientCount?: number | null;
  onActivated: (version: number) => void;
}

export function VersionEditor({
  modelId,
  version,
  activeVersion,
  definitions,
  clientCount = null,
  onActivated,
}: VersionEditorProps) {
  const updateVersion = useUpdateMetricModelVersion();
  const activateVersion = useActivateMetricModelVersion();
  const rebalance = useRebalanceMetricModel();

  const [draft, setDraft] = useState<DraftItem[]>(() => versionToDraft(version));
  /** Texto do campo de peso por métrica: o input guarda o que foi digitado, o rascunho o número. */
  const [weightText, setWeightText] = useState<Record<string, string>>({});
  const [openMetricId, setOpenMetricId] = useState<string | null>(null);
  const [toAdd, setToAdd] = useState('');
  const [proposal, setProposal] = useState<RebalanceProposalDto | null>(null);
  const [activateOpen, setActivateOpen] = useState(false);

  const editable = version.status === 'draft';
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]));
  const nameOf = (metricDefinitionId: string): string =>
    definitionsById.get(metricDefinitionId)?.name ?? 'Métrica removida';

  const check = weightsCheck(draft, definitionsById);
  const activeWeights = new Map(
    (activeVersion?.items ?? []).map((item) => [item.metricDefinitionId, item.weight]),
  );
  const proposedById = new Map(
    (proposal?.rows ?? []).map((row) => [row.metricDefinitionId, row.proposedWeight]),
  );
  const changes = compareDraftWithVersion(activeVersion, draft, nameOf);
  const dirty =
    JSON.stringify(draftToItems(draft)) !== JSON.stringify(draftToItems(versionToDraft(version)));

  const available = definitions.filter(
    (definition) => !draft.some((item) => item.metricDefinitionId === definition.id),
  );
  const openItem = draft.find((item) => item.metricDefinitionId === openMetricId) ?? null;
  const openDefinition = openMetricId === null ? undefined : definitionsById.get(openMetricId);

  const askRebalance = () =>
    rebalance.mutate(
      {
        modelId,
        body: {
          items: draft
            .filter((item) => item.included)
            .map((item) => ({ metricDefinitionId: item.metricDefinitionId, weight: item.weight })),
        },
      },
      { onSuccess: (data) => setProposal(data) },
    );

  const mutationError = updateVersion.error?.message ?? rebalance.error?.message ?? null;

  return (
    <>
      {mutationError !== null ? (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {mutationError}
        </p>
      ) : null}

      <div
        role="status"
        aria-label="Soma dos pesos"
        className={cn(
          'mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3',
          check.ok ? 'border-border' : 'border-destructive',
        )}
      >
        <div>
          <p className={cn('text-sm font-semibold', check.ok ? '' : 'text-destructive')}>
            Soma dos pesos: {percent(check.total)}
          </p>
          <p className="text-xs text-muted-foreground">{check.message}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Versão {version.version} ·{' '}
          {METRIC_MODEL_VERSION_STATUS_LABELS[version.status].toLowerCase()}
          {editable ? '' : ' · imutável'}
        </p>
      </div>

      {editable ? (
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="add-metric" className="text-xs text-muted-foreground">
              Adicionar métrica à versão
            </label>
            <select
              id="add-metric"
              className={cn(selectClassName, 'w-64')}
              value={toAdd}
              onChange={(event) => setToAdd(event.target.value)}
            >
              <option value="">Escolha uma métrica</option>
              {available.map((definition) => (
                <option key={definition.id} value={definition.id}>
                  {definition.name}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={toAdd === ''}
            onClick={() => {
              setDraft((items) => [...items, newDraftItem(toAdd)]);
              setToAdd('');
            }}
          >
            <Plus aria-hidden="true" />
            Adicionar
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={rebalance.isPending || draft.length === 0}
            onClick={askRebalance}
          >
            <Scale aria-hidden="true" />
            {rebalance.isPending ? 'Calculando…' : 'Redistribuir pesos'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!dirty || updateVersion.isPending}
            onClick={() =>
              updateVersion.mutate({
                modelId,
                version: version.version,
                items: draftToItems(draft),
              })
            }
          >
            {updateVersion.isPending ? 'Salvando…' : 'Salvar rascunho'}
          </Button>
          <Button
            type="button"
            disabled={!check.ok || dirty || activateVersion.isPending}
            onClick={() => setActivateOpen(true)}
          >
            Ativar versão
          </Button>
          {dirty ? (
            <span className="text-xs text-muted-foreground">Salve o rascunho antes de ativar.</span>
          ) : null}
        </div>
      ) : null}

      {proposal !== null ? (
        <RebalancePanel
          proposal={proposal}
          nameOf={nameOf}
          onApply={() => {
            setDraft((items) => applyRebalance(items, proposal.rows));
            setWeightText({});
            setProposal(null);
          }}
          onDiscard={() => setProposal(null)}
        />
      ) : null}

      {draft.length === 0 ? (
        <EmptyState
          icon={Scale}
          title="Nenhuma métrica nesta versão"
          description="Escolha as métricas que compõem o score e distribua os pesos até somarem 100 %."
        />
      ) : (
        <Table aria-label="Métricas do modelo">
          <TableHeader>
            <TableRow>
              <TableHead>Ativa</TableHead>
              <TableHead className="text-right">Ordem</TableHead>
              <TableHead>Métrica</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Peso empresa</TableHead>
              <TableHead className="text-right">Peso sugerido</TableHead>
              <TableHead className="text-right">Peso final</TableHead>
              <TableHead>Direção</TableHead>
              <TableHead>Normalização</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {draft.map((item, index) => {
              const definition = definitionsById.get(item.metricDefinitionId);
              const name = definition?.name ?? 'Métrica removida';
              const counts = item.included && (definition?.isActive ?? false);
              const suggested = proposedById.get(item.metricDefinitionId);
              return (
                <TableRow key={item.metricDefinitionId} data-metric-id={item.metricDefinitionId}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={item.included}
                      disabled={!editable}
                      aria-label={`Incluir ${name} nesta versão`}
                      onChange={(event) =>
                        setDraft((items) =>
                          patchDraftItem(items, item.metricDefinitionId, {
                            included: event.target.checked,
                          }),
                        )
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{index + 1}</TableCell>
                  <TableCell>
                    <Link
                      to={`/metrics/${item.metricDefinitionId}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {name}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {definition?.slug ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    {definition === undefined ? '—' : METRIC_TYPE_LABELS[definition.metricType]}
                  </TableCell>
                  <TableCell className="text-right">
                    {editable ? (
                      <Input
                        className="ml-auto h-8 w-24 text-right tabular-nums"
                        inputMode="decimal"
                        aria-label={`Peso de ${name} em porcentagem`}
                        value={
                          weightText[item.metricDefinitionId] ??
                          String(weightToPercent(item.weight))
                        }
                        onChange={(event) => {
                          const typed = event.target.value;
                          setWeightText((texts) => ({
                            ...texts,
                            [item.metricDefinitionId]: typed,
                          }));
                          const raw = Number(typed.replace(',', '.'));
                          const weight =
                            typed.trim() === '' || !Number.isFinite(raw)
                              ? 0
                              : percentToWeight(clampPercent(raw));
                          setDraft((items) =>
                            patchDraftItem(items, item.metricDefinitionId, { weight }),
                          );
                        }}
                      />
                    ) : (
                      <span className="tabular-nums">{percent(item.weight)}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {suggested === undefined ? '—' : percent(suggested)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {counts ? percent(item.weight) : '—'}
                  </TableCell>
                  <TableCell>
                    {definition === undefined ? '—' : METRIC_DIRECTION_LABELS[definition.direction]}
                  </TableCell>
                  <TableCell>
                    {NORMALIZATION_STRATEGY_LABELS[item.normalization.strategy]}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {statusOf(
                      item,
                      definition,
                      activeWeights.get(item.metricDefinitionId),
                      editable,
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={!editable || index === 0}
                        aria-label={`Subir ${name}`}
                        onClick={() => setDraft((items) => moveDraftItem(items, index, -1))}
                      >
                        <ArrowUp aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={!editable || index === draft.length - 1}
                        aria-label={`Descer ${name}`}
                        onClick={() => setDraft((items) => moveDraftItem(items, index, 1))}
                      >
                        <ArrowDown aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Configurar ${name}`}
                        onClick={() =>
                          setOpenMetricId((currentId) =>
                            currentId === item.metricDefinitionId ? null : item.metricDefinitionId,
                          )
                        }
                      >
                        <Settings2 aria-hidden="true" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        Peso sugerido vem da calibração com o histórico de cancelamentos ou de uma proposta de
        redistribuição; enquanto não houver nenhuma, a coluna fica em “—”. Peso final é o que
        realmente entra na conta: uma métrica desativada não soma.
      </p>

      {openItem !== null && openDefinition !== undefined ? (
        <div className="mt-6">
          <ItemConfigPanel
            key={openItem.metricDefinitionId}
            definition={openDefinition}
            item={openItem}
            readOnly={!editable}
            onClose={() => setOpenMetricId(null)}
            onApply={(patch) => {
              setDraft((items) => patchDraftItem(items, openItem.metricDefinitionId, patch));
              setOpenMetricId(null);
            }}
          />
        </div>
      ) : null}

      <ActivateDialog
        open={activateOpen}
        onOpenChange={setActivateOpen}
        version={version.version}
        activeVersion={activeVersion?.version ?? null}
        changes={changes}
        clientCount={clientCount}
        isPending={activateVersion.isPending}
        error={activateVersion.error?.message ?? null}
        onConfirm={() =>
          activateVersion.mutate(
            { modelId, version: version.version },
            {
              onSuccess: ({ version: activated }) => {
                setActivateOpen(false);
                onActivated(activated.version);
              },
            },
          )
        }
      />
    </>
  );
}
