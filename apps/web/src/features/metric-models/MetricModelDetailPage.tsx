/**
 * §38 /metric-models/:id — o configurador de métricas (§41).
 *
 * Esta tela carrega o modelo, escolhe qual versão está aberta e monta o editor daquela versão
 * (VersionEditor). As regras que mandam aqui:
 *
 *   §32 — só um RASCUNHO é editável; versão ativa ou arquivada é imutável e continua guardada
 *         com os scores que gerou. Editar e ativar vale para a organização inteira.
 *   §41 — os pesos das métricas ativas precisam somar 100 % exatos para ativar, e a soma fica
 *         visível o tempo todo.
 *   §41 — redistribuir é uma PROPOSTA: nada muda sem alguém aplicar.
 */
import { ArrowLeft, Plus, Scale } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { WEIGHT_MODE_LABELS, type MetricModelVersionDto } from '@inovaapss/shared';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { MetricsError, MetricsLoading } from '@/features/metrics/MetricsStates';

import { useAllMetricDefinitions, useCreateMetricModelVersion, useMetricModel } from './api';
import { useCalibrationSuggestions } from './calibration-suggestions';
import { draftToItems, versionToDraft } from './draft';
import { VersionEditor } from './VersionEditor';
import { VersionsPanel } from './VersionsPanel';

/** Qual versão abrir ao entrar na tela: o rascunho em aberto, senão a ativa, senão a última. */
function defaultVersion(versions: MetricModelVersionDto[]): number | null {
  const draft = versions.find((version) => version.status === 'draft');
  if (draft !== undefined) return draft.version;
  const active = versions.find((version) => version.status === 'active');
  if (active !== undefined) return active.version;
  return versions[versions.length - 1]?.version ?? null;
}

/**
 * Identidade do CONTEÚDO da versão no servidor. É a `key` do editor: quando a API devolve uma
 * versão diferente (porque acabamos de salvar, ou porque outra pessoa salvou), o editor remonta
 * com o que está gravado; um refetch que devolve o mesmo conteúdo não mexe na edição em curso.
 */
function versionSignature(version: MetricModelVersionDto): string {
  return JSON.stringify({
    id: version.id,
    status: version.status,
    items: draftToItems(versionToDraft(version)),
  });
}

export function MetricModelDetailPage() {
  const { id } = useParams();
  const model = useMetricModel(id);
  const definitions = useAllMetricDefinitions();
  const createVersion = useCreateMetricModelVersion();
  const [selected, setSelected] = useState<number | null>(null);
  // Hooks vêm antes de qualquer return: a lista de versões só existe depois da carga, então
  // passamos os ids que já temos (vazio enquanto carrega) e a busca se habilita sozinha.
  const calibration = useCalibrationSuggestions(
    (model.data?.versions ?? []).map((version) => version.id),
  );

  if (model.isPending) return <MetricsLoading label="Carregando o modelo" />;
  if (model.isError) {
    return (
      <MetricsError
        title="Não foi possível carregar o modelo"
        error={model.error}
        onRetry={() => void model.refetch()}
      />
    );
  }

  const versions = [...model.data.versions].sort((a, b) => a.version - b.version);
  const activeVersion = versions.find((version) => version.status === 'active') ?? null;
  const draftVersion = versions.find((version) => version.status === 'draft') ?? null;
  const shown =
    versions.find((version) => version.version === selected) ??
    versions.find((version) => version.version === defaultVersion(versions));

  const newVersion = () => {
    if (id !== undefined) createVersion.mutate({ modelId: id });
  };

  return (
    <>
      <PageHeader
        title={model.data.model.name}
        description={`Modo de peso: ${WEIGHT_MODE_LABELS[model.data.model.mode]}. ${
          activeVersion === null
            ? 'Nenhuma versão em vigor ainda.'
            : `Versão ${activeVersion.version} em vigor.`
        }`}
      >
        <Button asChild variant="ghost" size="sm">
          <Link to="/metric-models">
            <ArrowLeft aria-hidden="true" />
            Todos os modelos
          </Link>
        </Button>
      </PageHeader>

      {/* O mesmo aviso, com o mesmo acabamento da lista de modelos — duas telas irmãs. */}
      <p className="mb-6 rounded-xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        Editar aqui vale para a organização inteira: a partir da ativação, todos os clientes passam
        a ser pontuados por esta configuração. As versões anteriores e os scores que elas geraram
        ficam guardados — cada score histórico continua sabendo qual versão o gerou.
      </p>

      {createVersion.isError ? (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {createVersion.error.message}
        </p>
      ) : null}

      {shown === undefined ? (
        <EmptyState
          icon={Scale}
          title="Este modelo ainda não tem versão"
          description="A versão 1 é onde entram as métricas, os pesos, as faixas e os gatilhos. Ela só passa a valer quando for ativada."
          action={
            <Button type="button" disabled={createVersion.isPending} onClick={newVersion}>
              <Plus aria-hidden="true" />
              {createVersion.isPending ? 'Criando…' : 'Criar a versão 1'}
            </Button>
          }
        />
      ) : (
        <>
          {shown.status === 'draft' ? null : (
            <div className="mb-6">
              <Button
                type="button"
                className="w-full sm:w-auto"
                disabled={createVersion.isPending || draftVersion !== null}
                onClick={newVersion}
              >
                <Plus aria-hidden="true" />
                {draftVersion === null
                  ? 'Nova versão a partir da ativa'
                  : `Já existe o rascunho v${draftVersion.version}`}
              </Button>
            </div>
          )}

          <VersionEditor
            key={versionSignature(shown)}
            modelId={id as string}
            version={shown}
            activeVersion={activeVersion}
            definitions={definitions.data?.items ?? []}
            calibration={calibration}
            onActivated={setSelected}
          />

          <div className="mt-10">
            <VersionsPanel
              versions={versions}
              activeVersion={activeVersion}
              selected={shown.version}
              onSelect={setSelected}
              nameOf={(metricDefinitionId) =>
                (definitions.data?.items ?? []).find((item) => item.id === metricDefinitionId)
                  ?.name ?? 'Métrica removida'
              }
            />
          </div>
        </>
      )}
    </>
  );
}
