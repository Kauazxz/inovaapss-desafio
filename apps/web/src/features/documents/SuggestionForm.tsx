import { zodResolver } from '@hookform/resolvers/zod';
import { useId } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { METRIC_DIRECTIONS, METRIC_TYPES } from '@inovaapss/shared';
import {
  type CreateMetricSuggestionBody,
  createMetricSuggestionSchema,
  metricDirectionSchema,
  metricTypeSchema,
  suggestionNameSchema,
} from '@inovaapss/validation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import { METRIC_DIRECTION_LABELS, METRIC_TYPE_LABELS } from './format';

/** Campos do formulário como texto; a conversão para o corpo da API acontece no submit. */
const suggestionFormSchema = z.object({
  suggestedName: suggestionNameSchema,
  description: z.string().trim().max(1000, 'A descrição pode ter no máximo 1000 caracteres.'),
  suggestedType: metricTypeSchema,
  suggestedDirection: metricDirectionSchema,
  unit: z.string().trim().max(24, 'A unidade pode ter no máximo 24 caracteres.'),
  /** Percentual 0–100 (vazio = sem peso sugerido). */
  suggestedWeightPct: z.string().trim(),
  formulaJson: z.string().trim(),
  thresholdsJson: z.string().trim(),
  sourceExcerpt: z.string().trim().max(2000, 'O trecho pode ter no máximo 2000 caracteres.'),
});
type SuggestionFormValues = z.infer<typeof suggestionFormSchema>;

const FIELD_CLASS =
  'w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm dark:bg-input/30';

interface SuggestionFormProps {
  onSubmit(body: CreateMetricSuggestionBody): Promise<unknown>;
  onCancel?(): void;
  submitting?: boolean;
  /** Erro vindo da API (ex.: UNSAFE_FORMULA). */
  serverError?: string | null;
}

function parseJsonField(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

/** "Nova sugestão a partir deste documento": uma pessoa descreve a métrica que leu no texto. */
export function SuggestionForm({
  onSubmit,
  onCancel,
  submitting,
  serverError,
}: SuggestionFormProps) {
  const id = useId();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SuggestionFormValues>({
    resolver: zodResolver(suggestionFormSchema),
    defaultValues: {
      suggestedName: '',
      description: '',
      suggestedType: 'PERCENTAGE',
      suggestedDirection: 'HIGHER_IS_BETTER',
      unit: '',
      suggestedWeightPct: '',
      formulaJson: '',
      thresholdsJson: '',
      sourceExcerpt: '',
    },
  });

  const submit = async (values: SuggestionFormValues) => {
    let invalid = false;
    const body: CreateMetricSuggestionBody = {
      suggestedName: values.suggestedName,
      suggestedType: values.suggestedType,
      suggestedDirection: values.suggestedDirection,
    };
    if (values.description !== '') body.description = values.description;
    if (values.unit !== '') body.unit = values.unit;
    if (values.sourceExcerpt !== '') body.sourceExcerpt = values.sourceExcerpt;

    if (values.suggestedWeightPct !== '') {
      const pct = Number(values.suggestedWeightPct.replace(',', '.'));
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        setError('suggestedWeightPct', { message: 'Informe um percentual entre 0 e 100.' });
        invalid = true;
      } else {
        body.suggestedWeight = Math.round(pct * 100) / 10_000;
      }
    }
    if (values.formulaJson !== '') {
      const parsed = parseJsonField(values.formulaJson);
      if (!parsed.ok) {
        setError('formulaJson', { message: 'A fórmula precisa ser JSON válido.' });
        invalid = true;
      } else {
        body.suggestedFormula = parsed.value as Record<string, unknown>;
      }
    }
    if (values.thresholdsJson !== '') {
      const parsed = parseJsonField(values.thresholdsJson);
      if (!parsed.ok) {
        setError('thresholdsJson', { message: 'Os thresholds precisam ser JSON válido.' });
        invalid = true;
      } else {
        body.suggestedThresholds =
          parsed.value as CreateMetricSuggestionBody['suggestedThresholds'];
      }
    }
    if (invalid) return;

    const checked = createMetricSuggestionSchema.safeParse(body);
    if (!checked.success) {
      for (const issue of checked.error.issues) {
        const field = issue.path[0];
        if (field === 'suggestedFormula') setError('formulaJson', { message: issue.message });
        else if (field === 'suggestedThresholds') {
          setError('thresholdsJson', { message: issue.message });
        } else if (field === 'suggestedWeight') {
          setError('suggestedWeightPct', { message: issue.message });
        } else setError('suggestedName', { message: issue.message });
      }
      return;
    }
    try {
      await onSubmit(checked.data);
      reset();
    } catch {
      // o erro da API aparece por `serverError`
    }
  };

  const fieldError = (name: keyof SuggestionFormValues) =>
    errors[name] ? (
      <p id={`${id}-${name}-erro`} className="text-sm text-destructive">
        {errors[name]?.message}
      </p>
    ) : null;
  const describedBy = (name: keyof SuggestionFormValues) =>
    errors[name] ? `${id}-${name}-erro` : undefined;

  return (
    <form
      aria-label="Nova sugestão a partir deste documento"
      noValidate
      onSubmit={handleSubmit(submit)}
      className="space-y-4"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor={`${id}-suggestedName`}>Nome da métrica</Label>
          <Input
            id={`${id}-suggestedName`}
            aria-invalid={errors.suggestedName ? true : undefined}
            aria-describedby={describedBy('suggestedName')}
            placeholder="Ex.: Tempo médio de resolução"
            {...register('suggestedName')}
          />
          {fieldError('suggestedName')}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${id}-suggestedType`}>Tipo</Label>
          <select
            id={`${id}-suggestedType`}
            className={cn(FIELD_CLASS, 'h-9')}
            {...register('suggestedType')}
          >
            {METRIC_TYPES.map((type) => (
              <option key={type} value={type}>
                {METRIC_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${id}-suggestedDirection`}>Direção</Label>
          <select
            id={`${id}-suggestedDirection`}
            className={cn(FIELD_CLASS, 'h-9')}
            {...register('suggestedDirection')}
          >
            {METRIC_DIRECTIONS.map((direction) => (
              <option key={direction} value={direction}>
                {METRIC_DIRECTION_LABELS[direction]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${id}-unit`}>Unidade</Label>
          <Input id={`${id}-unit`} placeholder="h, %, chamados…" {...register('unit')} />
          {fieldError('unit')}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${id}-suggestedWeightPct`}>Peso sugerido (%)</Label>
          <Input
            id={`${id}-suggestedWeightPct`}
            inputMode="decimal"
            placeholder="Ex.: 16"
            aria-invalid={errors.suggestedWeightPct ? true : undefined}
            aria-describedby={describedBy('suggestedWeightPct')}
            {...register('suggestedWeightPct')}
          />
          {fieldError('suggestedWeightPct')}
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor={`${id}-description`}>Descrição</Label>
          <textarea
            id={`${id}-description`}
            rows={2}
            className={FIELD_CLASS}
            {...register('description')}
          />
          {fieldError('description')}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${id}-formulaJson`}>Fórmula (JSON Logic, opcional)</Label>
          <textarea
            id={`${id}-formulaJson`}
            rows={3}
            spellCheck={false}
            className={cn(FIELD_CLASS, 'font-mono text-xs')}
            placeholder='{"if": [{"<=": [{"var": "value"}, 8]}, 100, 40]}'
            aria-invalid={errors.formulaJson ? true : undefined}
            aria-describedby={describedBy('formulaJson')}
            {...register('formulaJson')}
          />
          {fieldError('formulaJson')}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${id}-thresholdsJson`}>Thresholds (JSON, opcional)</Label>
          <textarea
            id={`${id}-thresholdsJson`}
            rows={3}
            spellCheck={false}
            className={cn(FIELD_CLASS, 'font-mono text-xs')}
            placeholder='{"strategy": "THRESHOLD_BANDS", "bands": [{"upTo": 8, "health": 100}, {"upTo": null, "health": 0}]}'
            aria-invalid={errors.thresholdsJson ? true : undefined}
            aria-describedby={describedBy('thresholdsJson')}
            {...register('thresholdsJson')}
          />
          {fieldError('thresholdsJson')}
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor={`${id}-sourceExcerpt`}>Trecho do documento que justifica</Label>
          <textarea
            id={`${id}-sourceExcerpt`}
            rows={2}
            className={FIELD_CLASS}
            placeholder="Cole o trecho do texto extraído de onde a métrica veio."
            {...register('sourceExcerpt')}
          />
          {fieldError('sourceExcerpt')}
        </div>
      </div>

      {serverError ? (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isSubmitting || submitting}>
          {submitting ? 'Salvando…' : 'Salvar sugestão'}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  );
}
