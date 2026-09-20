import { Button } from '@/components/ui/button';

import { type PortfolioClient, useArchiveClient } from './api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './components/dialog';

export interface ArchiveClientDialogProps {
  client: PortfolioClient | null;
  onOpenChange: (open: boolean) => void;
  onArchived?: ((client: PortfolioClient) => void) | undefined;
}

/** Confirmação de arquivamento: o cliente some da lista, mas o histórico fica (nunca é apagado). */
export function ArchiveClientDialog({
  client,
  onOpenChange,
  onArchived,
}: ArchiveClientDialogProps) {
  const archive = useArchiveClient();

  const confirm = async () => {
    if (!client) return;
    try {
      const result = await archive.mutateAsync(client.id);
      onArchived?.(result.client);
      onOpenChange(false);
    } catch {
      // A mensagem fica visível no diálogo (archive.error).
    }
  };

  return (
    <Dialog open={client !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Arquivar {client?.name}?</DialogTitle>
          <DialogDescription>
            O cliente sai da carteira ativa e do dashboard, mas o histórico de métricas e scores
            continua guardado. Você pode encontrá-lo depois filtrando por status "Arquivado".
          </DialogDescription>
        </DialogHeader>
        {archive.error ? (
          <p role="alert" className="text-sm text-destructive">
            {archive.error.message}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void confirm()}
            disabled={archive.isPending}
          >
            {archive.isPending ? 'Arquivando…' : 'Arquivar cliente'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
