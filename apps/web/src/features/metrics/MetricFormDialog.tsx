/**
 * Cadastro de uma métrica (§31 do documento de métricas: nome, descrição, categoria, tipo,
 * unidade, direção, fonte, periodicidade e se está ativa).
 *
 * O que NÃO entra aqui: peso, normalização, faixas e gatilhos. Isso é configuração do MODELO,
 * não da métrica — a mesma métrica pode ter peso 18 % numa versão e 12 % na seguinte. Esses
 * campos vivem no configurador (/metric-models/:id).
 *
 * A chave (slug) é sugerida a partir do nome enquanto ninguém a editar à mão, porque ela é a
 * identidade estável da métrica na organização (é por ela que o importador liga as colunas).
 */
import { useState, type FormEvent } from 'react';

import {
  METRIC_DIRECTION_LABELS,
  METRIC_DIRECTIONS,
  METRIC_PERIODICITIES,
  METRIC_PERIODICITY_LABELS,
  METRIC_SOURCE_LABELS,
  METRIC_SOURCES,
  METRIC_TYPE_LABELS,
  METRIC_TYPES,
  type MetricDefinitionDto,
  type MetricDirection,
  type MetricPeriodicity,
  type MetricSource,
  type MetricType,
} from '@inovaapss/shared';
import { createMetricDefinitionSchema } from '@inovaapss/validation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/features/clients/components/dialog';
import { FormField, selectClassName } from '@/features/clients/components/form-field';
import { ApiError } from '@/lib/api';

import { useCreateMetric, useUpdateMetric } from './api';
import { suggestSlug } from './slug';

import type { MetricPrefill } from '@/features/documents/api';

const textareaClassName =
  'min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30';

interface FormValues {
  name: string;
  slug: string;
  description: string;
  category: string;
  metricType: MetricType;
  unit: string;
  direction: MetricDirection;
  periodicity: MetricPeriodicity;
  sourceType: MetricSource;
  isActive: boolean;
}

const EMPTY: FormValues = {
  name: '',
  slug: '',
  description: '',
  category: '',
  metricType: 'PERCENTAGE',
  unit: '',
  direction: 'HIGHER_IS_BETTER',
  periodicity: 'MONTHLY',
  sourceType: 'MANUAL',
  isActive: true,
};

function fromDefinition(definition: MetricDefinitionDto): FormValues {
  return {
    name: definition.name,
    slug: definition.slug,
    description: definition.description ?? '',
    category: definition.category ?? '',
    metricType: definition.metricType,
    unit: definition.unit ?? '',
    direction: definition.direction,
    periodicity: definition.periodicity,
    sourceType: definition.sourceType,
    isActive: definition.isActive,
  };
}

function fromPrefill(prefill: MetricPrefill): FormValues {
  return {
    name: prefill.name,
    slug: prefill.slug,
    description: prefill.description ?? '',
    category: prefill.category ?? '',
    metricType: prefill.metricType,
    unit: prefill.unit ?? '',
    direction: prefill.direction,
    periodicity: prefill.periodicity,
    sourceType: prefill.sourceType,
    isActive: prefill.isActive,
  };
}

export interface MetricFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Com definição = edição; sem = nova métrica. */
  definition?: MetricDefinitionDto | null | undefined;
  /** Sugestão aceita em /documents (§35): abre o formulário já preenchido. */
  prefill?: MetricPrefill | null | undefined;
  onSaved?: (definition: MetricDefinitionDto) => void;
}

/**
 * O formulário é um componente próprio porque o conteúdo do diálogo só existe enquanto ele está
 * aberto: fechar desmonta, abrir monta de novo e os campos nascem do que foi passado, sem
 * precisar ressincronizar estado em efeito nenhum.
 */
function MetricForm({
  onOpenChange,
  definition,
  prefill,
  onSaved,
}: Omit<MetricFormDialogProps, 'open'>) {
  const editing = definition != null;
  const create = useCreateMetric();
  const update = useUpdateMetric();
  const mutation = editing ? update : create;

  const initial =
    definition != null
      ? fromDefinition(definition)
      : prefill != null
        ? fromPrefill(prefill)
        : EMPTY;
  const [values, setValues] = useState<FormValues>(initial);
  const [slugTouched, setSlugTouched] = useState(initial.slug !== '');
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body = {
      name: values.name,
      slug: values.slug === '' ? suggestSlug(values.name) : values.slug,
      description: values.description === '' ? null : values.description,
      category: values.category === '' ? null : values.category,
      metricType: values.metricType,
      unit: values.unit === '' ? null : values.unit,
      direction: values.direction,
      periodicity: values.periodicity,
      sourceType: values.sourceType,
      isActive: values.isActive,
    };
    const parsed = createMetricDefinitionSchema.safeParse(body);
    if (!parsed.success) {
      const next: Partial<Record<keyof FormValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string') next[field as keyof FormValues] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    try {
      const result = editing
        ? await update.mutateAsync({ id: definition.id, body: parsed.data })
        : await create.mutateAsync(parsed.data);
      onOpenChange(false);
      onSaved?.(result.definition);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'SLUG_TAKEN') {
        setErrors({ slug: 'Já existe uma métrica com esta chave na organização.' });
      }
    }
  };

  const genericError =
    mutation.error !== null &&
    !(mutation.error instanceof ApiError && mutation.error.code === 'SLUG_TAKEN')
      ? mutation.error.message
      : null;

  const title = editing ? 'Editar métrica' : 'Nova métrica';

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          Cadastro da métrica. Peso, normalização, faixas e gatilhos são configuração do modelo e
          ficam em Modelos de métricas.
        </DialogDescription>
      </DialogHeader>
      <form aria-label={title} noValidate onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Nome" error={errors.name}>
            {(control) => (
              <Input
                {...control}
                value={values.name}
                onChange={(event) => {
                  const name = event.target.value;
                  setValues((current) => ({
                    ...current,
                    name,
                    slug: slugTouched ? current.slug : suggestSlug(name),
                  }));
                }}
              />
            )}
          </FormField>
          <FormField
            label="Chave"
            error={errors.slug}
            hint="Identidade estável da métrica (ex.: sla_compliance). É por ela que a importação liga as colunas."
          >
            {(control) => (
              <Input
                {...control}
                value={values.slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  set('slug', event.target.value);
                }}
              />
            )}
          </FormField>
        </div>

        <FormField label="Descrição" error={errors.description}>
          {(control) => (
            <textarea
              {...control}
              className={textareaClassName}
              value={values.description}
              onChange={(event) => set('description', event.target.value)}
            />
          )}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Categoria" error={errors.category}>
            {(control) => (
              <Input
                {...control}
                value={values.category}
                onChange={(event) => set('category', event.target.value)}
              />
            )}
          </FormField>
          <FormField label="Unidade" error={errors.unit} hint="Ex.: %, h, R$, chamados.">
            {(control) => (
              <Input
                {...control}
                value={values.unit}
                onChange={(event) => set('unit', event.target.value)}
              />
            )}
          </FormField>
          <FormField label="Tipo" error={errors.metricType}>
            {(control) => (
              <select
                {...control}
                className={selectClassName}
                value={values.metricType}
                onChange={(event) => set('metricType', event.target.value as MetricType)}
              >
                {METRIC_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {METRIC_TYPE_LABELS[value]}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField
            label="Direção"
            error={errors.direction}
            hint="Diz o que é bom: maior é melhor, maior é pior ou ficar dentro de uma faixa."
          >
            {(control) => (
              <select
                {...control}
                className={selectClassName}
                value={values.direction}
                onChange={(event) => set('direction', event.target.value as MetricDirection)}
              >
                {METRIC_DIRECTIONS.map((value) => (
                  <option key={value} value={value}>
                    {METRIC_DIRECTION_LABELS[value]}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField label="Fonte" error={errors.sourceType}>
            {(control) => (
              <select
                {...control}
                className={selectClassName}
                value={values.sourceType}
                onChange={(event) => set('sourceType', event.target.value as MetricSource)}
              >
                {METRIC_SOURCES.map((value) => (
                  <option key={value} value={value}>
                    {METRIC_SOURCE_LABELS[value]}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField label="Periodicidade" error={errors.periodicity}>
            {(control) => (
              <select
                {...control}
                className={selectClassName}
                value={values.periodicity}
                onChange={(event) => set('periodicity', event.target.value as MetricPeriodicity)}
              >
                {METRIC_PERIODICITIES.map((value) => (
                  <option key={value} value={value}>
                    {METRIC_PERIODICITY_LABELS[value]}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.isActive}
            onChange={(event) => set('isActive', event.target.checked)}
          />
          Métrica ativa (entra no cálculo e na soma dos pesos do modelo)
        </label>

        {genericError !== null ? (
          <p role="alert" className="text-sm text-destructive">
            {genericError}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar métrica'}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function MetricFormDialog({ open, ...props }: MetricFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <MetricForm {...props} />
      </DialogContent>
    </Dialog>
  );
}
