/**
 * Editor da normalização de um item (§9 e §41): uma variante de campos por estratégia.
 * O estado (texto) e a conversão para o objeto cru ficam em `normalization.ts`.
 */
import { Plus, Trash2 } from 'lucide-react';

import { NORMALIZATION_STRATEGIES, NORMALIZATION_STRATEGY_LABELS } from '@inovaapss/shared';

import { Button } from '@/components/ui/button';

import { SelectField, TextField, TextareaField } from './fields';
import { CUSTOM_RULE_EXAMPLE, type NormalizationState } from './normalization';

const METHOD_OPTIONS = [
  { value: 'auto', label: 'Automático (mediana quando há outlier)' },
  { value: 'mean', label: 'Média' },
  { value: 'median', label: 'Mediana' },
] as const;

const COMBINE_OPTIONS = [
  { value: 'worst', label: 'Pior dos dois' },
  { value: 'average', label: 'Média dos dois' },
] as const;

export function NormalizationEditor({
  state,
  onChange,
  disabled,
}: {
  state: NormalizationState;
  onChange: (state: NormalizationState) => void;
  disabled: boolean;
}) {
  const setField = (key: string, value: string) =>
    onChange({ ...state, fields: { ...state.fields, [key]: value } });
  const field = (key: string) => state.fields[key] ?? '';

  return (
    <div className="space-y-3">
      <SelectField
        label="Estratégia"
        value={state.strategy}
        disabled={disabled}
        onChange={(strategy) =>
          onChange({
            ...state,
            strategy,
            json:
              strategy === 'CUSTOM_SAFE_RULE' && state.json === ''
                ? CUSTOM_RULE_EXAMPLE
                : state.json,
          })
        }
        options={NORMALIZATION_STRATEGIES.map((strategy) => ({
          value: strategy,
          label: NORMALIZATION_STRATEGY_LABELS[strategy],
        }))}
      />

      {state.strategy === 'LINEAR_RANGE' ? (
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Mínimo"
            type="number"
            disabled={disabled}
            value={field('min')}
            onChange={(value) => setField('min', value)}
          />
          <TextField
            label="Máximo"
            type="number"
            disabled={disabled}
            value={field('max')}
            onChange={(value) => setField('max', value)}
          />
          <TextField
            label="Faixa-alvo (de)"
            type="number"
            disabled={disabled}
            value={field('targetMin')}
            onChange={(value) => setField('targetMin', value)}
          />
          <TextField
            label="Faixa-alvo (até)"
            type="number"
            disabled={disabled}
            value={field('targetMax')}
            onChange={(value) => setField('targetMax', value)}
            hint="Deixe as duas em branco se não houver faixa-alvo."
          />
        </div>
      ) : null}

      {state.strategy === 'RATIO_TO_TARGET' ? (
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Meta"
            type="number"
            disabled={disabled}
            value={field('target')}
            onChange={(value) => setField('target', value)}
          />
          <TextField
            label="Zera em (× a meta)"
            type="number"
            disabled={disabled}
            value={field('zeroAtRatio')}
            onChange={(value) => setField('zeroAtRatio', value)}
          />
          <TextField
            label="Tolerância"
            type="number"
            disabled={disabled}
            value={field('tolerance')}
            onChange={(value) => setField('tolerance', value)}
          />
          <TextField
            label="Zera com desvio de"
            type="number"
            disabled={disabled}
            value={field('zeroAtDeviation')}
            onChange={(value) => setField('zeroAtDeviation', value)}
          />
        </div>
      ) : null}

      {state.strategy === 'BASELINE_DEVIATION' ? (
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Janela do baseline (períodos)"
            type="number"
            disabled={disabled}
            value={field('window')}
            onChange={(value) => setField('window', value)}
          />
          <TextField
            label="Histórico mínimo"
            type="number"
            disabled={disabled}
            value={field('minHistory')}
            onChange={(value) => setField('minHistory', value)}
          />
          <SelectField
            label="Método"
            disabled={disabled}
            value={field('method')}
            onChange={(value) => setField('method', value)}
            options={METHOD_OPTIONS}
          />
          <SelectField
            label="Combinação com as faixas"
            disabled={disabled}
            value={field('combine')}
            onChange={(value) => setField('combine', value)}
            options={COMBINE_OPTIONS}
          />
          <TextField
            label="Tolerância (% de desvio)"
            type="number"
            disabled={disabled}
            value={field('tolerancePct')}
            onChange={(value) => setField('tolerancePct', value)}
          />
          <TextField
            label="Desvio que zera (%)"
            type="number"
            disabled={disabled}
            value={field('maxDeviationPct')}
            onChange={(value) => setField('maxDeviationPct', value)}
          />
          <TextField
            label="Fator de outlier"
            type="number"
            disabled={disabled}
            value={field('outlierFactor')}
            onChange={(value) => setField('outlierFactor', value)}
          />
        </div>
      ) : null}

      {state.strategy === 'BOOLEAN_MAP' ? (
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Health quando sim"
            type="number"
            disabled={disabled}
            value={field('trueHealth')}
            onChange={(value) => setField('trueHealth', value)}
          />
          <TextField
            label="Health quando não"
            type="number"
            disabled={disabled}
            value={field('falseHealth')}
            onChange={(value) => setField('falseHealth', value)}
          />
        </div>
      ) : null}

      {state.strategy === 'THRESHOLD_BANDS' ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            As faixas vão da menor para a maior. A última precisa ficar com o limite em branco: é
            ela que recebe tudo o que sobrar.
          </p>
          {state.bands.map((band, index) => (
            <div key={index} className="flex items-end gap-2">
              <TextField
                label={`Até (faixa ${index + 1})`}
                type="number"
                className="flex-1"
                disabled={disabled}
                value={band.upTo}
                onChange={(value) =>
                  onChange({
                    ...state,
                    bands: state.bands.map((b, i) => (i === index ? { ...b, upTo: value } : b)),
                  })
                }
              />
              <TextField
                label="Health"
                type="number"
                className="flex-1"
                disabled={disabled}
                value={band.health}
                onChange={(value) =>
                  onChange({
                    ...state,
                    bands: state.bands.map((b, i) => (i === index ? { ...b, health: value } : b)),
                  })
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || state.bands.length <= 1}
                aria-label={`Remover a faixa ${index + 1}`}
                onClick={() =>
                  onChange({ ...state, bands: state.bands.filter((_, i) => i !== index) })
                }
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() =>
              onChange({ ...state, bands: [...state.bands, { upTo: '', health: '' }] })
            }
          >
            <Plus aria-hidden="true" />
            Adicionar faixa
          </Button>
        </div>
      ) : null}

      {state.strategy === 'SCORE_MAP' ? (
        <div className="space-y-2">
          {state.entries.map((entry, index) => (
            <div key={index} className="flex items-end gap-2">
              <TextField
                label={`Categoria ${index + 1}`}
                className="flex-1"
                disabled={disabled}
                value={entry.key}
                onChange={(value) =>
                  onChange({
                    ...state,
                    entries: state.entries.map((e, i) => (i === index ? { ...e, key: value } : e)),
                  })
                }
              />
              <TextField
                label="Health"
                type="number"
                className="flex-1"
                disabled={disabled}
                value={entry.health}
                onChange={(value) =>
                  onChange({
                    ...state,
                    entries: state.entries.map((e, i) =>
                      i === index ? { ...e, health: value } : e,
                    ),
                  })
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                aria-label={`Remover a categoria ${index + 1}`}
                onClick={() =>
                  onChange({ ...state, entries: state.entries.filter((_, i) => i !== index) })
                }
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() =>
              onChange({ ...state, entries: [...state.entries, { key: '', health: '' }] })
            }
          >
            <Plus aria-hidden="true" />
            Adicionar categoria
          </Button>
          <TextField
            label="Health de categoria fora do mapa"
            type="number"
            disabled={disabled}
            value={field('defaultHealth')}
            onChange={(value) => setField('defaultHealth', value)}
            hint="Em branco: categoria desconhecida fica N/A, nunca saudável."
          />
        </div>
      ) : null}

      {state.strategy === 'CUSTOM_SAFE_RULE' ? (
        <TextareaField
          label="JSON da regra segura"
          disabled={disabled}
          value={state.json === '' ? CUSTOM_RULE_EXAMPLE : state.json}
          onChange={(value) => onChange({ ...state, json: value })}
          hint='Só operadores permitidos (var, if, comparações, aritmética, min/max, map/filter/reduce, in, cat, substr). Com "output": "value" é obrigatório informar "then".'
        />
      ) : null}
    </div>
  );
}
