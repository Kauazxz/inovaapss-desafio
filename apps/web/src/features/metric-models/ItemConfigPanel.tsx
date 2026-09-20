/**
 * Painel lateral do configurador (§41): normalização, faixas/limites, tendência, persistência e
 * gatilhos de UMA métrica dentro da versão em edição, mais o "Simular" reaproveitado de
 * features/metrics.
 *
 * Nada é aplicado sem passar pelos schemas de @inovaapss/validation — os mesmos que a API usa —,
 * então a mensagem de erro que aparece aqui é a mensagem que a API daria.
 */
import { X } from 'lucide-react';
import { useState } from 'react';

import {
  METRIC_DIRECTION_LABELS,
  METRIC_TYPE_LABELS,
  type MetricDefinitionDto,
  type MetricModelItemDto,
} from '@inovaapss/shared';
import {
  normalizationConfigSchema,
  thresholdConfigSchema,
  triggerListSchema,
  type FormulaConfigInput,
  type NormalizationConfigInput,
  type ThresholdConfigInput,
  type TriggerListInput,
} from '@inovaapss/validation';

import { Button } from '@/components/ui/button';
import { SimulatePanel } from '@/features/metrics/SimulatePanel';

import { PanelSection, SelectField, TextField } from './fields';
import { firstIssueMessage, toNumber } from './format';
import {
  CUSTOM_RULE_EXAMPLE,
  normalizationToState,
  stateToConfig,
  type NormalizationState,
} from './normalization';
import { NormalizationEditor } from './NormalizationEditor';
import { rowsToTriggers, TriggerRuleError, triggersToRows, type TriggerRow } from './triggers';
import { TriggersEditor } from './TriggersEditor';

import type { DraftItem } from './draft';

/** Parte do item que este painel edita. */
export interface ItemConfigPatch {
  normalization: NormalizationConfigInput;
  thresholds: ThresholdConfigInput | null;
  triggers: TriggerListInput | null;
  formula: FormulaConfigInput | null;
  currentWeight: number;
  trendWeight: number;
  persistenceWeight: number;
}

interface ThresholdFields {
  trendWindow: string;
  trendMethod: string;
  trendBasis: string;
  fullDeteriorationChange: string;
  baselineWindow: string;
  trendTarget: string;
  persistenceWindow: string;
  unhealthyBelow: string;
  minEvaluatedPeriods: string;
}

type Rec = Record<string, unknown>;

function asRecord(value: unknown): Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Rec) : {};
}

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

function thresholdsToFields(config: unknown): ThresholdFields {
  const c = asRecord(config);
  const trend = asRecord(c.trend);
  const persistence = asRecord(c.persistence);
  return {
    trendWindow: text(trend.window),
    trendMethod: text(trend.method),
    trendBasis: text(trend.basis),
    fullDeteriorationChange: text(trend.fullDeteriorationChange),
    baselineWindow: text(trend.baselineWindow),
    trendTarget: text(trend.target),
    persistenceWindow: text(persistence.window),
    unhealthyBelow: text(persistence.unhealthyBelow),
    minEvaluatedPeriods: text(persistence.minEvaluatedPeriods),
  };
}

function put(out: Rec, key: string, raw: string): void {
  if (raw.trim() === '') return;
  out[key] = toNumber(raw);
}

function fieldsToThresholds(fields: ThresholdFields): unknown {
  const trend: Rec = {};
  put(trend, 'window', fields.trendWindow);
  put(trend, 'fullDeteriorationChange', fields.fullDeteriorationChange);
  put(trend, 'baselineWindow', fields.baselineWindow);
  put(trend, 'target', fields.trendTarget);
  if (fields.trendMethod !== '') trend.method = fields.trendMethod;
  if (fields.trendBasis !== '') trend.basis = fields.trendBasis;

  const persistence: Rec = {};
  put(persistence, 'window', fields.persistenceWindow);
  put(persistence, 'unhealthyBelow', fields.unhealthyBelow);
  put(persistence, 'minEvaluatedPeriods', fields.minEvaluatedPeriods);

  const out: Rec = {};
  if (Object.keys(trend).length > 0) out.trend = trend;
  if (Object.keys(persistence).length > 0) out.persistence = persistence;
  return Object.keys(out).length === 0 ? null : out;
}

const TREND_METHOD_OPTIONS = [
  { value: '', label: 'Padrão (variação percentual)' },
  { value: 'DELTA_PERCENT', label: 'Variação percentual' },
  { value: 'DELTA_ABSOLUTE', label: 'Variação absoluta' },
  { value: 'MOVING_AVERAGE', label: 'Média móvel' },
  { value: 'SLOPE', label: 'Inclinação (regressão linear)' },
  { value: 'BASELINE_COMPARISON', label: 'Comparação com o baseline' },
];

const TREND_BASIS_OPTIONS = [
  { value: '', label: 'Padrão' },
  { value: 'RAW', label: 'Valor bruto' },
  { value: 'HEALTH', label: 'Health normalizado' },
];

/** Item do rascunho → forma de `MetricModelItemDto`, que é o que o SimulatePanel espera. */
function toSimulationItem(item: DraftItem): MetricModelItemDto {
  return {
    id: 'rascunho',
    metricModelVersionId: 'rascunho',
    metricDefinitionId: item.metricDefinitionId,
    weight: item.weight,
    currentWeight: item.currentWeight,
    trendWeight: item.trendWeight,
    persistenceWeight: item.persistenceWeight,
    normalizationStrategy: item.normalization.strategy,
    normalizationConfig: item.normalization as unknown as MetricModelItemDto['normalizationConfig'],
    thresholdConfig: item.thresholds as unknown as MetricModelItemDto['thresholdConfig'],
    criticalTriggerConfig: item.triggers as unknown as MetricModelItemDto['criticalTriggerConfig'],
    formulaConfig: item.formula as unknown as MetricModelItemDto['formulaConfig'],
    sortOrder: 0,
  };
}

export interface ItemConfigPanelProps {
  definition: MetricDefinitionDto;
  item: DraftItem;
  /** Versão ativa ou arquivada: mostra tudo, não deixa mudar nada (§32). */
  readOnly: boolean;
  onApply: (patch: ItemConfigPatch) => void;
  onClose: () => void;
}

/**
 * O estado nasce do item e não é ressincronizado depois: quem abre o painel para outra métrica
 * passa `key={metricDefinitionId}` e o React remonta com o rascunho daquela linha. Assim uma
 * edição em andamento nunca é apagada por um refetch em segundo plano.
 */
export function ItemConfigPanel({
  definition,
  item,
  readOnly,
  onApply,
  onClose,
}: ItemConfigPanelProps) {
  const [normalization, setNormalization] = useState<NormalizationState>(() =>
    normalizationToState(item.normalization),
  );
  const [thresholds, setThresholds] = useState<ThresholdFields>(() =>
    thresholdsToFields(item.thresholds),
  );
  const [triggers, setTriggers] = useState<TriggerRow[]>(() => triggersToRows(item.triggers));
  const [components, setComponents] = useState(() => ({
    current: String(item.currentWeight),
    trend: String(item.trendWeight),
    persistence: String(item.persistenceWeight),
  }));
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    let rawNormalization: unknown;
    if (normalization.strategy === 'CUSTOM_SAFE_RULE') {
      const source = normalization.json === '' ? CUSTOM_RULE_EXAMPLE : normalization.json;
      try {
        rawNormalization = JSON.parse(source);
      } catch {
        setError('A normalização não é um JSON válido.');
        return;
      }
    } else {
      rawNormalization = stateToConfig(normalization);
    }
    const parsedNormalization = normalizationConfigSchema.safeParse(rawNormalization);
    if (!parsedNormalization.success) {
      setError(firstIssueMessage(parsedNormalization.error));
      return;
    }

    const rawThresholds = fieldsToThresholds(thresholds);
    let parsedThresholds: ThresholdConfigInput | null = null;
    if (rawThresholds !== null) {
      const result = thresholdConfigSchema.safeParse(rawThresholds);
      if (!result.success) {
        setError(firstIssueMessage(result.error));
        return;
      }
      parsedThresholds = result.data;
    }

    let parsedTriggers: TriggerListInput | null = null;
    if (triggers.length > 0) {
      let rawTriggers: unknown[];
      try {
        rawTriggers = rowsToTriggers(triggers);
      } catch (cause) {
        setError(cause instanceof TriggerRuleError ? cause.message : 'Gatilho inválido.');
        return;
      }
      const result = triggerListSchema.safeParse(rawTriggers);
      if (!result.success) {
        setError(firstIssueMessage(result.error));
        return;
      }
      parsedTriggers = result.data;
    }

    const current = toNumber(components.current);
    const trend = toNumber(components.trend);
    const persistence = toNumber(components.persistence);
    const invalidComponent = [current, trend, persistence].some(
      (value) => value === undefined || !Number.isFinite(value) || value < 0 || value > 1,
    );
    if (invalidComponent) {
      setError('Os pesos de atual, tendência e persistência são frações de 0 a 1.');
      return;
    }
    if ((current as number) + (trend as number) + (persistence as number) <= 0) {
      setError('Os pesos dos componentes (atual, tendência, persistência) não podem somar zero.');
      return;
    }

    setError(null);
    onApply({
      normalization: parsedNormalization.data,
      thresholds: parsedThresholds,
      triggers: parsedTriggers,
      formula: item.formula,
      currentWeight: current as number,
      trendWeight: trend as number,
      persistenceWeight: persistence as number,
    });
  };

  return (
    <aside
      aria-label={`Configuração de ${definition.name}`}
      className="space-y-5 rounded-xl bg-card p-4 shadow-soft ring-1 ring-foreground/5 sm:p-5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-medium">{definition.name}</h3>
          <p className="text-xs text-muted-foreground">
            {METRIC_TYPE_LABELS[definition.metricType]} ·{' '}
            {METRIC_DIRECTION_LABELS[definition.direction]} · {definition.slug}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-9 shrink-0 sm:size-7"
          onClick={onClose}
          aria-label="Fechar painel"
        >
          <X aria-hidden="true" />
        </Button>
      </div>

      {readOnly ? (
        <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Esta versão já foi ativada ou arquivada e é imutável (§32). Para mudar a configuração,
          crie uma nova versão a partir da ativa.
        </p>
      ) : null}

      <PanelSection
        title="Normalização"
        description="Como o valor bruto vira um health de 0 a 100."
      >
        <NormalizationEditor
          state={normalization}
          onChange={setNormalization}
          disabled={readOnly}
        />
      </PanelSection>

      <PanelSection
        title="Composição do score"
        description="Health da métrica = atual × p1 + tendência × p2 + persistência × p3. Só a proporção importa."
      >
        {/* Três frações curtas: uma coluna no celular, as três lado a lado a partir do sm. */}
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField
            label="Atual"
            type="number"
            disabled={readOnly}
            value={components.current}
            onChange={(value) => setComponents((c) => ({ ...c, current: value }))}
          />
          <TextField
            label="Tendência"
            type="number"
            disabled={readOnly}
            value={components.trend}
            onChange={(value) => setComponents((c) => ({ ...c, trend: value }))}
          />
          <TextField
            label="Persistência"
            type="number"
            disabled={readOnly}
            value={components.persistence}
            onChange={(value) => setComponents((c) => ({ ...c, persistence: value }))}
          />
        </div>
      </PanelSection>

      <PanelSection
        title="Tendência e persistência"
        description="Janelas e método. Em branco, o motor usa o padrão (3 períodos)."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <TextField
            label="Janela da tendência"
            type="number"
            disabled={readOnly}
            value={thresholds.trendWindow}
            onChange={(value) => setThresholds((t) => ({ ...t, trendWindow: value }))}
          />
          <SelectField
            label="Método da tendência"
            disabled={readOnly}
            value={thresholds.trendMethod}
            onChange={(value) => setThresholds((t) => ({ ...t, trendMethod: value }))}
            options={TREND_METHOD_OPTIONS}
          />
          <SelectField
            label="Base da tendência"
            disabled={readOnly}
            value={thresholds.trendBasis}
            onChange={(value) => setThresholds((t) => ({ ...t, trendBasis: value }))}
            options={TREND_BASIS_OPTIONS}
          />
          <TextField
            label="Variação que zera a tendência"
            type="number"
            disabled={readOnly}
            value={thresholds.fullDeteriorationChange}
            onChange={(value) => setThresholds((t) => ({ ...t, fullDeteriorationChange: value }))}
          />
          <TextField
            label="Janela da persistência"
            type="number"
            disabled={readOnly}
            value={thresholds.persistenceWindow}
            onChange={(value) => setThresholds((t) => ({ ...t, persistenceWindow: value }))}
          />
          <TextField
            label="Abaixo disso o período é ruim"
            type="number"
            disabled={readOnly}
            value={thresholds.unhealthyBelow}
            onChange={(value) => setThresholds((t) => ({ ...t, unhealthyBelow: value }))}
          />
        </div>
      </PanelSection>

      <PanelSection
        title="Gatilhos críticos"
        description="Peso contribui para o score; gatilho gera ação imediata e vira alerta."
      >
        <TriggersEditor rows={triggers} onChange={setTriggers} disabled={readOnly} />
      </PanelSection>

      {error !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {readOnly ? null : (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={apply}>
            Aplicar ao rascunho
          </Button>
        </div>
      )}

      <div className="border-t border-border pt-4">
        <SimulatePanel
          definition={definition}
          item={toSimulationItem(item)}
          caption="Usa a configuração que já está no rascunho. Aplique as mudanças antes de simular. Nada é salvo."
        />
      </div>
    </aside>
  );
}
