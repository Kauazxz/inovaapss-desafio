/**
 * Histórico de versões do modelo (§31, §32). Versão ativa ou arquivada é imutável: aqui ela só
 * pode ser aberta para leitura ou comparada com a que está em vigor. Nenhuma ação desta lista
 * apaga configuração antiga nem os scores que ela gerou.
 */
import { useState } from 'react';

import { METRIC_MODEL_VERSION_STATUS_LABELS, type MetricModelVersionDto } from '@inovaapss/shared';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { compareItems } from './draft';

const pt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

function totalOf(version: MetricModelVersionDto): string {
  const total = version.items.reduce((acc, item) => acc + item.weight, 0);
  return `${pt.format(Math.round(total * 10000) / 100)} %`;
}

function dateOf(value: string | null): string {
  if (value === null) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');
}

export function VersionsPanel({
  versions,
  activeVersion,
  selected,
  onSelect,
  nameOf,
}: {
  versions: MetricModelVersionDto[];
  activeVersion: MetricModelVersionDto | null;
  selected: number | null;
  onSelect: (version: number) => void;
  nameOf: (metricDefinitionId: string) => string;
}) {
  const [comparing, setComparing] = useState<number | null>(null);
  const compared = versions.find((version) => version.version === comparing) ?? null;
  const changes =
    compared === null || activeVersion === null
      ? []
      : compareItems(activeVersion.items, compared.items, nameOf);

  return (
    <section aria-labelledby="versoes-titulo" className="space-y-3">
      <div>
        <h3 id="versoes-titulo" className="text-base font-semibold">
          Versões
        </h3>
        <p className="text-sm text-muted-foreground">
          Versões ativadas e arquivadas são imutáveis. Elas ficam guardadas com os scores que
          geraram, e cada score histórico sabe qual versão o calculou.
        </p>
      </div>

      <Table aria-label="Versões do modelo">
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">Versão</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead>Em vigor desde</TableHead>
            <TableHead className="text-right">Métricas</TableHead>
            <TableHead className="text-right">Soma dos pesos</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {versions.map((version) => (
            <TableRow key={version.id} data-version={version.version}>
              <TableCell className="text-right tabular-nums">{version.version}</TableCell>
              <TableCell>{METRIC_MODEL_VERSION_STATUS_LABELS[version.status]}</TableCell>
              <TableCell>{dateOf(version.effectiveFrom)}</TableCell>
              <TableCell className="text-right tabular-nums">{version.items.length}</TableCell>
              <TableCell className="text-right tabular-nums">{totalOf(version)}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={selected === version.version}
                    onClick={() => onSelect(version.version)}
                  >
                    Abrir
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={activeVersion === null || activeVersion.version === version.version}
                    onClick={() =>
                      setComparing((current) =>
                        current === version.version ? null : version.version,
                      )
                    }
                  >
                    Comparar com a ativa
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {compared !== null && activeVersion !== null ? (
        <div
          aria-label={`Diferenças entre a versão ${activeVersion.version} e a versão ${compared.version}`}
          className="space-y-2 rounded-xl border border-border p-4"
        >
          <h4 className="text-sm font-semibold">
            Da versão {activeVersion.version} para a versão {compared.version}
          </h4>
          {changes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              As duas versões têm os mesmos pesos e a mesma configuração.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {changes.map((change) => (
                <li key={`${change.metricDefinitionId}-${change.kind}`}>
                  <span className="font-medium">{change.metricName}</span>: {change.description}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
