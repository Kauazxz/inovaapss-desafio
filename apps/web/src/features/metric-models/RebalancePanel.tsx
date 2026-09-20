/**
 * Proposta de redistribuição de pesos (§41). A regra do documento é explícita: NUNCA
 * redistribuir em silêncio. A API devolve a proposta com `saved: false` e nada muda até alguém
 * clicar em "Aplicar ao rascunho" aqui — e mesmo então só o rascunho muda, não a versão ativa.
 */
import type { RebalanceProposalDto } from '@inovaapss/shared';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { percent, signedPercentPoints } from './format';

export function RebalancePanel({
  proposal,
  nameOf,
  onApply,
  onDiscard,
}: {
  proposal: RebalanceProposalDto;
  nameOf: (metricDefinitionId: string) => string;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const changed = proposal.rows.filter((row) => row.difference !== 0);

  return (
    <section
      aria-labelledby="rebalance-titulo"
      className="mb-6 space-y-3 rounded-xl border border-border bg-muted/20 p-4"
    >
      <div>
        <h3 id="rebalance-titulo" className="text-base font-semibold">
          Proposta de redistribuição
        </h3>
        <p className="text-sm text-muted-foreground">
          Os pesos atuais somam {percent(proposal.currentTotal)}. A proposta mantém a proporção
          entre as métricas ativas e fecha em {percent(proposal.proposedTotal)}. Nada foi salvo: ela
          só entra no rascunho se você aplicar.
        </p>
      </div>

      {changed.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          A proposta é igual aos pesos de hoje: não há nada a redistribuir.
        </p>
      ) : (
        <Table aria-label="Proposta de redistribuição de pesos">
          <TableHeader>
            <TableRow>
              <TableHead>Métrica</TableHead>
              <TableHead className="text-right">Peso atual</TableHead>
              <TableHead className="text-right">Peso proposto</TableHead>
              <TableHead className="text-right">Diferença</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {changed.map((row) => (
              <TableRow key={row.metricDefinitionId}>
                <TableCell>{nameOf(row.metricDefinitionId)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {percent(row.currentWeight)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {percent(row.proposedWeight)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {signedPercentPoints(row.difference)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDiscard}>
          Descartar proposta
        </Button>
        <Button type="button" onClick={onApply} disabled={changed.length === 0}>
          Aplicar ao rascunho
        </Button>
      </div>
    </section>
  );
}
