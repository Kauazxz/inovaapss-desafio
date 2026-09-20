/**
 * "Novo modelo" (§41). O modo de peso (§25) é escolhido aqui: Manual, Assistido — o preferido,
 * em que o sistema sugere e a empresa aprova — ou Automático.
 *
 * O modelo nasce sem versão: a versão 1 é montada no configurador e só passa a valer quando
 * alguém a ativa com os pesos somando 100 %.
 */
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';

import { WEIGHT_MODE_LABELS, WEIGHT_MODES, type WeightMode } from '@inovaapss/shared';
import { metricModelNameSchema } from '@inovaapss/validation';

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

import { useCreateMetricModel } from './api';

/**
 * O formulário é um componente próprio porque o conteúdo do diálogo só existe enquanto ele está
 * aberto: fechar desmonta, abrir monta de novo e os campos nascem vazios sem precisar limpar
 * estado em efeito nenhum.
 */
function ModelForm({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const create = useCreateMetricModel();
  const [name, setName] = useState('');
  const [mode, setMode] = useState<WeightMode>('ASSISTED');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = metricModelNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Nome inválido.');
      return;
    }
    setError(null);
    create.mutate(
      { name: parsed.data, mode, isActive: true },
      {
        onSuccess: ({ model }) => {
          onOpenChange(false);
          void navigate(`/metric-models/${model.id}`);
        },
      },
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Novo modelo de métricas</DialogTitle>
        <DialogDescription>
          O modelo agrupa as métricas, os pesos e os gatilhos que calculam a saúde de toda a
          carteira. Ele nasce sem versão: a versão 1 é montada no configurador.
        </DialogDescription>
      </DialogHeader>
      <form aria-label="Novo modelo de métricas" noValidate onSubmit={submit} className="space-y-4">
        <FormField label="Nome" error={error ?? undefined}>
          {(control) => (
            <Input
              {...control}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="GlobalSys v1"
            />
          )}
        </FormField>
        <FormField
          label="Modo de peso"
          hint="Assistido: o sistema sugere os pesos e a empresa aprova. É o modo preferido."
        >
          {(control) => (
            <select
              {...control}
              className={selectClassName}
              value={mode}
              onChange={(event) => setMode(event.target.value as WeightMode)}
            >
              {WEIGHT_MODES.map((value) => (
                <option key={value} value={value}>
                  {WEIGHT_MODE_LABELS[value]}
                </option>
              ))}
            </select>
          )}
        </FormField>
        {create.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {create.error.message}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Criando…' : 'Criar modelo'}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function ModelFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <ModelForm onOpenChange={onOpenChange} />
      </DialogContent>
    </Dialog>
  );
}
