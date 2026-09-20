/**
 * Confirmação de "Descartar rascunho" (§41). Descartar apaga de vez a versão em edição, então
 * o diálogo diz o que some e o que fica: a versão em vigor continua pontuando a carteira e
 * nenhum histórico é tocado (§31, §32).
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

export function DiscardDialog({
  open,
  onOpenChange,
  version,
  activeVersion,
  itemCount,
  onConfirm,
  isPending,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: number;
  /** Versão que continua em vigor depois do descarte, quando existe alguma. */
  activeVersion: number | null;
  itemCount: number;
  onConfirm: () => void;
  isPending: boolean;
  error: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Descartar o rascunho da versão {version}?</DialogTitle>
          <DialogDescription>
            O rascunho é apagado e não volta. Isso não muda nada no cálculo de hoje.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-1.5 text-sm">
          <li>
            Some: o rascunho da versão {version} e{' '}
            {itemCount === 1 ? 'a métrica configurada nele' : `as ${itemCount} métricas nele`}.
          </li>
          <li>
            Fica:{' '}
            {activeVersion === null
              ? 'nenhuma versão em vigor — o modelo continua sem pontuar a carteira.'
              : `a versão ${activeVersion}, que segue em vigor e pontuando todos os clientes.`}
          </li>
          <li>Fica: todo o histórico já calculado, intocado.</li>
        </ul>

        {error ? (
          <p className="text-sm text-class-critical" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Manter o rascunho
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Descartando…' : 'Descartar o rascunho'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
