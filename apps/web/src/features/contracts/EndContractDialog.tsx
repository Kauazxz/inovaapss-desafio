import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/features/clients/components/dialog';

import { type Contract, useUpdateContract } from './api';
import { formatDate, todayIso } from './labels';

export interface EndContractDialogProps {
  contract: Contract | null;
  onOpenChange: (open: boolean) => void;
}

/** Encerra um contrato: PATCH status `ended` com a data de término escolhida (padrão: hoje). */
export function EndContractDialog({ contract, onOpenChange }: EndContractDialogProps) {
  return (
    <Dialog open={contract !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* A chave remonta o corpo a cada contrato: estado e mutação começam do zero. */}
        {contract ? (
          <EndContractBody key={contract.id} contract={contract} onOpenChange={onOpenChange} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EndContractBody({
  contract,
  onOpenChange,
}: {
  contract: Contract;
  onOpenChange: (open: boolean) => void;
}) {
  const dateId = useId();
  const update = useUpdateContract();
  const [endDate, setEndDate] = useState(todayIso);
  const [dateError, setDateError] = useState<string | null>(null);

  const confirm = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      setDateError('Informe a data de término.');
      return;
    }
    if (endDate < contract.startDate) {
      setDateError(
        `A data de término não pode ser anterior ao início (${formatDate(contract.startDate)}).`,
      );
      return;
    }
    setDateError(null);
    try {
      await update.mutateAsync({ contractId: contract.id, input: { status: 'ended', endDate } });
      onOpenChange(false);
    } catch {
      // update.error fica visível.
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Encerrar contrato</DialogTitle>
        <DialogDescription>
          O cliente fica sem contrato ativo até você criar outro. O histórico do contrato é mantido.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label htmlFor={dateId}>Data de término</Label>
        <Input
          id={dateId}
          type="date"
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
          aria-invalid={dateError ? true : undefined}
          aria-describedby={dateError ? `${dateId}-erro` : undefined}
        />
        {dateError ? (
          <p id={`${dateId}-erro`} className="text-sm text-destructive">
            {dateError}
          </p>
        ) : null}
      </div>
      {update.error ? (
        <p role="alert" className="text-sm text-destructive">
          {update.error.message}
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
          disabled={update.isPending}
        >
          {update.isPending ? 'Encerrando…' : 'Encerrar contrato'}
        </Button>
      </DialogFooter>
    </>
  );
}
