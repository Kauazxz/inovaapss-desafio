/**
 * §38 /metric-models — os modelos de score da organização e suas versões (§31, §32).
 *
 * Cada linha resume o modelo como o §41 pede: a versão ativa, o modo de peso (§25), quantas
 * métricas ela tem e quanto os pesos somam — o número que precisa fechar 100 % para ativar.
 */
import { Layers, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import {
  WEIGHT_MODE_LABELS,
  type MetricDefinitionDto,
  type MetricModelVersionDto,
} from '@inovaapss/shared';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MetricsError, MetricsLoading } from '@/features/metrics/MetricsStates';
import { cn } from '@/lib/utils';

import {
  useAllMetricDefinitions,
  useCreateMetricModelVersion,
  useMetricModelsWithVersions,
  type MetricModelSummary,
} from './api';
import { versionToDraft, weightsCheck } from './draft';
import { percent } from './format';
import { ModelFormDialog } from './ModelFormDialog';

function activeVersionOf(summary: MetricModelSummary): MetricModelVersionDto | null {
  return summary.detail?.versions.find((version) => version.status === 'active') ?? null;
}

function draftVersionOf(summary: MetricModelSummary): MetricModelVersionDto | null {
  return summary.detail?.versions.find((version) => version.status === 'draft') ?? null;
}

// Colunas de apoio saem do caminho no celular (§8 do guia). O que sobra conta a história:
// qual modelo, qual versão está em vigor, se a soma fecha e o que dá para fazer. A mesma
// classe vai no <TableHead> e no <TableCell> da coluna, senão a tabela desalinha.
const HIDDEN_UNTIL_MD = 'hidden md:table-cell';
const HIDDEN_UNTIL_LG = 'hidden lg:table-cell';

function ModelRow({
  summary,
  definitionsById,
  onNewVersion,
  creating,
}: {
  summary: MetricModelSummary;
  definitionsById: Map<string, MetricDefinitionDto>;
  onNewVersion: (modelId: string) => void;
  creating: boolean;
}) {
  const active = activeVersionOf(summary);
  const draft = draftVersionOf(summary);
  const check = active === null ? null : weightsCheck(versionToDraft(active), definitionsById);

  return (
    <TableRow data-model-id={summary.model.id}>
      <TableCell className="min-w-40 whitespace-normal">
        <Link
          to={`/metric-models/${summary.model.id}`}
          className="rounded-md font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {summary.model.name}
        </Link>
        <span className="block text-xs text-muted-foreground">
          {summary.model.isActive ? 'Modelo ativo' : 'Modelo desativado'}
        </span>
      </TableCell>
      <TableCell className={HIDDEN_UNTIL_LG}>{WEIGHT_MODE_LABELS[summary.mode]}</TableCell>
      <TableCell className="tabular-nums">
        {summary.isPending ? '…' : active === null ? 'Nenhuma' : `versão ${active.version}`}
      </TableCell>
      <TableCell className={cn(HIDDEN_UNTIL_MD, 'text-right tabular-nums')}>
        {active === null ? '—' : active.items.length}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {check === null ? '—' : percent(check.total)}
      </TableCell>
      <TableCell className={cn(HIDDEN_UNTIL_MD, 'text-muted-foreground')}>
        {draft === null ? 'Sem rascunho aberto' : `Rascunho v${draft.version} em aberto`}
      </TableCell>
      <TableCell className="text-right">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={creating || active === null || draft !== null}
          onClick={() => onNewVersion(summary.model.id)}
        >
          Nova versão a partir da ativa
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function MetricModelsPage() {
  const { list, summaries } = useMetricModelsWithVersions();
  const definitions = useAllMetricDefinitions();
  const createVersion = useCreateMetricModelVersion();
  const [formOpen, setFormOpen] = useState(false);

  const definitionsById = new Map(
    (definitions.data?.items ?? []).map((definition) => [definition.id, definition]),
  );

  return (
    <>
      <PageHeader
        title="Modelos de métricas"
        description="Pesos, faixas, gatilhos e versões do modelo que calcula a saúde de toda a carteira."
      >
        <Button type="button" onClick={() => setFormOpen(true)}>
          <Plus aria-hidden="true" />
          Novo modelo
        </Button>
      </PageHeader>

      <div className="space-y-6">
        <p className="rounded-xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          O modelo pertence à organização: mudar um peso muda o score de todos os clientes a partir
          da ativação. As versões anteriores e os scores que elas geraram continuam guardados.
        </p>

        {createVersion.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {createVersion.error.message}
          </p>
        ) : null}

        {list.isPending ? (
          <MetricsLoading label="Carregando modelos" />
        ) : list.isError ? (
          <MetricsError
            title="Não foi possível carregar os modelos"
            error={list.error}
            onRetry={() => void list.refetch()}
          />
        ) : summaries.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="Nenhum modelo de métricas"
            description="Um modelo agrupa as métricas, os pesos e os gatilhos que calculam a saúde da carteira. Crie o primeiro e monte a versão 1."
            action={
              <Button type="button" onClick={() => setFormOpen(true)}>
                <Plus aria-hidden="true" />
                Novo modelo
              </Button>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-xl bg-card shadow-soft ring-1 ring-foreground/5">
            <Table aria-label="Modelos de métricas">
              <TableHeader>
                <TableRow>
                  <TableHead>Modelo</TableHead>
                  <TableHead className={HIDDEN_UNTIL_LG}>Modo de peso</TableHead>
                  <TableHead>Versão ativa</TableHead>
                  <TableHead className={cn(HIDDEN_UNTIL_MD, 'text-right')}>Métricas</TableHead>
                  <TableHead className="text-right">Soma dos pesos</TableHead>
                  <TableHead className={HIDDEN_UNTIL_MD}>Rascunho</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.map((summary) => (
                  <ModelRow
                    key={summary.model.id}
                    summary={summary}
                    definitionsById={definitionsById}
                    creating={createVersion.isPending}
                    onNewVersion={(modelId) => createVersion.mutate({ modelId })}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <ModelFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </>
  );
}
