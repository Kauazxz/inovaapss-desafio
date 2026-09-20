/**
 * Confirmação de "Ativar versão" (§41). Ativar não é salvar: é trocar o modelo que pontua TODA
 * a organização. Por isso o diálogo mostra, antes de confirmar, o que muda em relação à versão
 * ativa de hoje — e lembra que a versão anterior e os scores que ela gerou continuam guardados
 * (§32).
 */
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/features/clients/components/dialog';

import type { VersionChange } from './draft';

const KIND_LABELS: Readonly<Record<VersionChange['kind'], string>> = {
  added: 'Entra',
  removed: 'Sai',
  weight: 'Peso',
  config: 'Configuração',
};

export function ActivateDialog({
  open,
  onOpenChange,
  version,
  activeVersion,
  changes,
  clientCount,
  onConfirm,
  isPending,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: number;
  activeVersion: number | null;
  changes: VersionChange[];
  /** Quantos clientes passam a ser pontuados pela versão nova, quando a tela souber. */
  clientCount: number | null;
  onConfirm: () => void;
  isPending: boolean;
  error: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Ativar a versão {version}?</DialogTitle>
          <DialogDescription>
            {activeVersion === null
              ? 'Este será o primeiro modelo em vigor: a partir de agora todos os clientes da organização passam a ser pontuados por ele.'
              : `A versão ${activeVersion} sai de vigor e é arquivada. Ela e os scores que gerou continuam guardados — nada de histórico é apagado.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <h3 className="text-sm font-medium">
            O que muda{activeVersion === null ? '' : ` em relação à versão ${activeVersion}`}
          </h3>
          {changes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma diferença de peso ou configuração em relação à versão ativa.
            </p>
          ) : (
            <ul aria-label="Mudanças da versão" className="space-y-1 text-sm">
              {changes.map((change) => (
                <li key={`${change.metricDefinitionId}-${change.kind}`}>
                  <span className="text-muted-foreground">{KIND_LABELS[change.kind]}</span>{' '}
                  <span className="font-medium">{change.metricName}</span>: {change.description}
                </li>
              ))}
            </ul>
          )}
          <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Vale para a organização inteira
            {clientCount === null ? '' : ` (${clientCount} clientes na carteira)`}, não para um
            cliente só. Os scores passados continuam com a versão que os gerou; para pontuar o
            histórico pela versão nova, rode o recálculo.
          </p>
        </div>

        {error !== null ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Ativando…' : `Ativar a versão ${version}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
