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
import { ArrowDown, ArrowUp, Plus, Scale, Settings2, Trash2 } from 'lucide-react';
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
  useDiscardMetricModelVersion,
  useRebalanceMetricModel,
  useUpdateMetricModelVersion,
} from './api';
import { type CalibrationSuggestions, suggestedWeightNote } from './calibration-suggestions';
import { DiscardDialog } from './DiscardDialog';
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

// A tabela do configurador tem onze colunas — a mais larga do sistema. No celular ficam só as
// quatro que respondem "que métrica é, quanto ela pesa e o que fazer com ela"; o resto volta
// conforme sobra espaço (§8 do guia). A classe vai no par <TableHead> + <TableCell> da coluna.
const HIDDEN_UNTIL_MD = 'hidden md:table-cell';
const HIDDEN_UNTIL_LG = 'hidden lg:table-cell';
const HIDDEN_UNTIL_XL = 'hidden xl:table-cell';

export interface VersionEditorProps {
  modelId: string;
  version: MetricModelVersionDto;
  activeVersion: MetricModelVersionDto | null;
  definitions: MetricDefinitionDto[];
  /** Quantos clientes passam a ser pontuados pela versão ativada, quando a tela souber. */
  clientCount?: number | null;
  /** Pesos da última calibração deste modelo (§26), quando já houve alguma. */
  calibration?: CalibrationSuggestions | null;
  onActivated: (version: number) => void;
}

export function VersionEditor({
  modelId,
  version,
  activeVersion,
  definitions,
  clientCount = null,
  calibration = null,
  onActivated,
}: VersionEditorProps) {
  const updateVersion = useUpdateMetricModelVersion();
  const activateVersion = useActivateMetricModelVersion();
  const discardVersion = useDiscardMetricModelVersion();
  const rebalance = useRebalanceMetricModel();

  const [draft, setDraft] = useState<DraftItem[]>(() => versionToDraft(version));
  /** Texto do campo de peso por métrica: o input guarda o que foi digitado, o rascunho o número. */
  const [weightText, setWeightText] = useState<Record<string, string>>({});
  const [openMetricId, setOpenMetricId] = useState<string | null>(null);
  const [toAdd, setToAdd] = useState('');
  const [proposal, setProposal] = useState<RebalanceProposalDto | null>(null);
  const [activateOpen, setActivateOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

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

      {/* A soma fica visível o tempo todo (§41). No celular empilha; do sm para cima a versão
          vai para a direita. O anel avisa quando a soma não fecha. */}
      <div
        role="status"
        aria-label="Soma dos pesos"
        className={cn(
          'mb-6 flex flex-col gap-2 rounded-xl bg-card p-4 shadow-soft ring-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5',
          check.ok ? 'ring-foreground/5' : 'ring-destructive/40',
        )}
      >
        <div className="min-w-0">
          <p className={cn('text-sm font-medium', check.ok ? '' : 'text-destructive')}>
            Soma dos pesos: {percent(check.total)}
          </p>
          <p className="text-xs text-muted-foreground">{check.message}</p>
        </div>
        <p className="text-xs text-muted-foreground sm:shrink-0 sm:text-right">
          Versão {version.version} ·{' '}
          {METRIC_MODEL_VERSION_STATUS_LABELS[version.status].toLowerCase()}
          {editable ? '' : ' · imutável'}
        </p>
      </div>

      {editable ? (
        // Barra de ações: no celular o campo ocupa a linha inteira e os botões se acomodam
        // abaixo; do sm para cima tudo volta para a mesma faixa (§8 do guia).
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex w-full min-w-0 flex-col gap-1 sm:w-64">
            <label htmlFor="add-metric" className="text-xs text-muted-foreground">
              Adicionar métrica à versão
            </label>
            <select
              id="add-metric"
              className={selectClassName}
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
          <div className="flex flex-wrap items-center gap-2">
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
            <Button
              type="button"
              variant="outline"
              disabled={discardVersion.isPending}
              onClick={() => setDiscardOpen(true)}
            >
              <Trash2 aria-hidden="true" />
              Descartar rascunho
            </Button>
            {dirty ? (
              <span className="text-xs text-muted-foreground">
                Salve o rascunho antes de ativar.
              </span>
            ) : null}
          </div>
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
        <div className="overflow-hidden rounded-xl bg-card shadow-soft ring-1 ring-foreground/5">
          <Table aria-label="Métricas do modelo">
            <TableHeader>
              <TableRow>
                <TableHead>Ativa</TableHead>
                <TableHead className={cn(HIDDEN_UNTIL_LG, 'text-right')}>Ordem</TableHead>
                <TableHead>Métrica</TableHead>
                <TableHead className={HIDDEN_UNTIL_LG}>Tipo</TableHead>
                <TableHead className="text-right">Peso empresa</TableHead>
                <TableHead className={cn(HIDDEN_UNTIL_MD, 'text-right')}>Peso sugerido</TableHead>
                <TableHead className={cn(HIDDEN_UNTIL_MD, 'text-right')}>Peso final</TableHead>
                <TableHead className={HIDDEN_UNTIL_XL}>Direção</TableHead>
                <TableHead className={HIDDEN_UNTIL_LG}>Normalização</TableHead>
                <TableHead className={HIDDEN_UNTIL_MD}>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {draft.map((item, index) => {
                const definition = definitionsById.get(item.metricDefinitionId);
                const name = definition?.name ?? 'Métrica removida';
                const counts = item.included && (definition?.isActive ?? false);
                // A proposta de redistribuição está na tela agora e ganha da calibração, que é
                // a leitura de fundo do histórico.
                const suggested =
                  proposedById.get(item.metricDefinitionId) ??
                  calibration?.weightByMetricId.get(item.metricDefinitionId);
                return (
                  <TableRow key={item.metricDefinitionId} data-metric-id={item.metricDefinitionId}>
                    <TableCell>
                      <input
                        type="checkbox"
                        className="size-4 accent-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
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
                    <TableCell className={cn(HIDDEN_UNTIL_LG, 'text-right tabular-nums')}>
                      {index + 1}
                    </TableCell>
                    <TableCell className="min-w-40 whitespace-normal">
                      <Link
                        to={`/metrics/${item.metricDefinitionId}`}
                        className="rounded-md font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        {name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {definition?.slug ?? '—'}
                      </span>
                    </TableCell>
                    <TableCell className={HIDDEN_UNTIL_LG}>
                      {definition === undefined ? '—' : METRIC_TYPE_LABELS[definition.metricType]}
                    </TableCell>
                    <TableCell className="text-right">
                      {editable ? (
                        <Input
                          className="ml-auto w-20 text-right tabular-nums sm:w-24"
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
                    <TableCell className={cn(HIDDEN_UNTIL_MD, 'text-right tabular-nums')}>
                      {suggested === undefined ? '—' : percent(suggested)}
                    </TableCell>
                    <TableCell className={cn(HIDDEN_UNTIL_MD, 'text-right tabular-nums')}>
                      {counts ? percent(item.weight) : '—'}
                    </TableCell>
                    <TableCell className={HIDDEN_UNTIL_XL}>
                      {definition === undefined
                        ? '—'
                        : METRIC_DIRECTION_LABELS[definition.direction]}
                    </TableCell>
                    <TableCell className={HIDDEN_UNTIL_LG}>
                      {NORMALIZATION_STRATEGY_LABELS[item.normalization.strategy]}
                    </TableCell>
                    <TableCell className={cn(HIDDEN_UNTIL_MD, 'text-muted-foreground')}>
                      {statusOf(
                        item,
                        definition,
                        activeWeights.get(item.metricDefinitionId),
                        editable,
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {/* Alvo de toque de 36 px no celular; a partir de sm o botão encolhe (§9). */}
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="size-9 sm:size-7"
                          disabled={!editable || index === 0}
                          aria-label={`Subir ${name}`}
                          onClick={() => setDraft((items) => moveDraftItem(items, index, -1))}
                        >
                          <ArrowUp aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="size-9 sm:size-7"
                          disabled={!editable || index === draft.length - 1}
                          aria-label={`Descer ${name}`}
                          onClick={() => setDraft((items) => moveDraftItem(items, index, 1))}
                        >
                          <ArrowDown aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="size-9 sm:size-7"
                          aria-label={`Configurar ${name}`}
                          onClick={() =>
                            setOpenMetricId((currentId) =>
                              currentId === item.metricDefinitionId
                                ? null
                                : item.metricDefinitionId,
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
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        {suggestedWeightNote(calibration, proposal !== null)} Peso final é o que realmente entra na
        conta: uma métrica desativada não soma.
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

      <DiscardDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        version={version.version}
        activeVersion={activeVersion?.version ?? null}
        itemCount={draft.length}
        isPending={discardVersion.isPending}
        error={discardVersion.error?.message ?? null}
        onConfirm={() =>
          discardVersion.mutate(
            { modelId, version: version.version },
            { onSuccess: () => setDiscardOpen(false) },
          )
        }
      />

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
