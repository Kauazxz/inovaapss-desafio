/**
 * Revisar as sugestões da análise TODAS DE UMA VEZ e virar cadastro (§35).
 *
 * Aceitar uma por uma existe e continua valendo quando a pessoa quer ler a evidência de cada
 * uma. Mas quando um arquivo rende oito métricas, oito idas e voltas ao formulário são oito
 * chances de desistir — e o caso que importa é justamente o da empresa que acabou de chegar,
 * com tudo zerado, e precisa sair do zero.
 *
 * Aqui a pessoa desmarca o que não quer, corrige nome, chave, tipo, direção e unidade na
 * própria linha, e cria o lote. Cada linha é uma chamada independente: se uma falhar (chave
 * repetida, por exemplo), as outras entram do mesmo jeito e a que falhou diz por quê.
 *
 * Peso e modelo não entram aqui de propósito: quanto cada métrica vale no score é decisão da
 * empresa, na tela de Métricas.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import {
  METRIC_DIRECTION_LABELS,
  METRIC_DIRECTIONS,
  METRIC_TYPE_LABELS,
  METRIC_TYPES,
  type MetricDirection,
  type MetricType,
} from '@inovaapss/shared';

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
import { createMetricDefinition, metricsKeys } from '@/features/metrics/api';
import { suggestSlug } from '@/features/metrics/slug';
import { cn } from '@/lib/utils';

import { acceptSuggestion, documentKeys, type MetricSuggestion } from './api';

const selectClassName =
  'h-9 w-full rounded-lg border border-input bg-card px-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

/** Uma sugestão em edição. O que a pessoa digitar aqui é o que vai para o cadastro. */
interface Linha {
  id: string;
  escolhida: boolean;
  nome: string;
  chave: string;
  /** A chave segue o nome enquanto ninguém a editar à mão. */
  chaveManual: boolean;
  tipo: MetricType;
  direcao: MetricDirection;
  unidade: string;
  descricao: string | null;
  confianca: number | null;
  /** Resultado da última tentativa de criar. */
  erro: string | null;
  criada: boolean;
}

function paraLinha(sugestao: MetricSuggestion): Linha {
  return {
    id: sugestao.id,
    escolhida: true,
    nome: sugestao.suggestedName,
    chave: suggestSlug(sugestao.suggestedName),
    chaveManual: false,
    tipo: sugestao.suggestedType,
    direcao: sugestao.suggestedDirection,
    unidade: sugestao.unit ?? '',
    descricao: sugestao.description,
    confianca: sugestao.confidence,
    erro: null,
    criada: false,
  };
}

function mensagem(erro: unknown): string {
  return erro instanceof Error ? erro.message : 'Não foi possível criar esta métrica.';
}

export interface BulkSuggestionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  /** Só as pendentes: aceitas e recusadas já saíram da fila. */
  suggestions: readonly MetricSuggestion[];
}

export function BulkSuggestionsDialog({
  open,
  onOpenChange,
  documentId,
  suggestions,
}: BulkSuggestionsDialogProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [linhas, setLinhas] = useState<Linha[]>(() => suggestions.map(paraLinha));

  const editar = (id: string, patch: Partial<Linha>) =>
    setLinhas((atual) =>
      atual.map((linha) => (linha.id === id ? { ...linha, ...patch, erro: null } : linha)),
    );

  const criar = useMutation({
    mutationFn: async (escolhidas: readonly Linha[]) => {
      const resultados: { id: string; erro: string | null }[] = [];
      // Uma de cada vez: o erro de uma linha não pode derrubar as outras, e a API tem limite.
      for (const linha of escolhidas) {
        try {
          await createMetricDefinition({
            name: linha.nome.trim(),
            slug: linha.chave.trim(),
            description: linha.descricao,
            category: null,
            metricType: linha.tipo,
            unit: linha.unidade.trim() === '' ? null : linha.unidade.trim(),
            direction: linha.direcao,
            periodicity: 'MONTHLY',
            sourceType: 'DOCUMENT',
            isActive: true,
          });
          // O cadastro veio primeiro: marcar a sugestão como aceita só depois de existir mesmo.
          await acceptSuggestion(linha.id);
          resultados.push({ id: linha.id, erro: null });
        } catch (erro) {
          resultados.push({ id: linha.id, erro: mensagem(erro) });
        }
      }
      return resultados;
    },
    onSuccess: (resultados) => {
      const porId = new Map(resultados.map((item) => [item.id, item.erro]));
      setLinhas((atual) =>
        atual.map((linha) => {
          if (!porId.has(linha.id)) return linha;
          const erro = porId.get(linha.id) ?? null;
          return { ...linha, erro, criada: erro === null, escolhida: erro !== null };
        }),
      );
      void queryClient.invalidateQueries({ queryKey: documentKeys.suggestions(documentId) });
      void queryClient.invalidateQueries({ queryKey: metricsKeys.all });
      // Tudo certo: a pessoa vai direto ver as métricas que acabou de criar.
      if (resultados.every((item) => item.erro === null)) {
        onOpenChange(false);
        void navigate('/metrics');
      }
    },
  });

  const escolhidas = linhas.filter((linha) => linha.escolhida && !linha.criada);
  const invalida = escolhidas.some(
    (linha) => linha.nome.trim().length < 2 || linha.chave.trim().length < 2,
  );
  const criadas = linhas.filter((linha) => linha.criada).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Criar métricas a partir da análise</DialogTitle>
          <DialogDescription>
            Desmarque o que não quiser e corrija o que estiver torto. Cada linha vira uma métrica da
            organização; o peso de cada uma no score fica para depois, na tela de Métricas.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50dvh] space-y-3 overflow-y-auto pr-1">
          {linhas.map((linha) => (
            <div
              key={linha.id}
              className={cn(
                'rounded-xl border border-border p-3',
                linha.criada && 'border-transparent bg-muted/40',
                linha.erro !== null && 'border-destructive',
              )}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-2"
                  checked={linha.escolhida && !linha.criada}
                  disabled={linha.criada || criar.isPending}
                  aria-label={`Criar a métrica ${linha.nome}`}
                  onChange={(evento) => editar(linha.id, { escolhida: evento.target.checked })}
                />
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    Nome
                    <Input
                      className="h-9"
                      value={linha.nome}
                      disabled={linha.criada || criar.isPending}
                      onChange={(evento) =>
                        editar(linha.id, {
                          nome: evento.target.value,
                          ...(linha.chaveManual ? {} : { chave: suggestSlug(evento.target.value) }),
                        })
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    Chave
                    <Input
                      className="h-9 font-mono text-xs"
                      value={linha.chave}
                      disabled={linha.criada || criar.isPending}
                      onChange={(evento) =>
                        editar(linha.id, { chave: evento.target.value, chaveManual: true })
                      }
                    />
                  </label>
                  <div className="grid grid-cols-3 gap-2 sm:col-span-2">
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Tipo
                      <select
                        className={selectClassName}
                        value={linha.tipo}
                        disabled={linha.criada || criar.isPending}
                        onChange={(evento) =>
                          editar(linha.id, { tipo: evento.target.value as MetricType })
                        }
                      >
                        {METRIC_TYPES.map((tipo) => (
                          <option key={tipo} value={tipo}>
                            {METRIC_TYPE_LABELS[tipo]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Direção
                      <select
                        className={selectClassName}
                        value={linha.direcao}
                        disabled={linha.criada || criar.isPending}
                        onChange={(evento) =>
                          editar(linha.id, { direcao: evento.target.value as MetricDirection })
                        }
                      >
                        {METRIC_DIRECTIONS.map((direcao) => (
                          <option key={direcao} value={direcao}>
                            {METRIC_DIRECTION_LABELS[direcao]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                      Unidade
                      <Input
                        className="h-9"
                        placeholder="%, h, R$…"
                        value={linha.unidade}
                        disabled={linha.criada || criar.isPending}
                        onChange={(evento) => editar(linha.id, { unidade: evento.target.value })}
                      />
                    </label>
                  </div>
                </div>
              </div>

              {linha.confianca !== null && !linha.criada && linha.erro === null ? (
                <p className="mt-2 pl-7 text-xs text-muted-foreground">
                  Confiança da análise: {Math.round(linha.confianca * 100)} %
                </p>
              ) : null}
              {linha.criada ? (
                <p className="mt-2 flex items-center gap-1.5 pl-7 text-xs text-muted-foreground">
                  <CircleCheck className="size-3.5" aria-hidden="true" />
                  Métrica criada.
                </p>
              ) : null}
              {linha.erro === null ? null : (
                <p
                  role="alert"
                  className="mt-2 flex items-start gap-1.5 pl-7 text-xs text-destructive"
                >
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  {linha.erro}
                </p>
              )}
            </div>
          ))}
        </div>

        <DialogFooter>
          <div className="mr-auto text-xs text-muted-foreground">
            {criadas > 0 ? `${criadas} criada${criadas === 1 ? '' : 's'} · ` : ''}
            {escolhidas.length} selecionada{escolhidas.length === 1 ? '' : 's'}
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={criar.isPending}
            onClick={() => onOpenChange(false)}
          >
            Fechar
          </Button>
          <Button
            type="button"
            disabled={escolhidas.length === 0 || invalida || criar.isPending}
            onClick={() => criar.mutate(escolhidas)}
          >
            <Sparkles aria-hidden="true" />
            {criar.isPending
              ? 'Criando…'
              : `Criar ${escolhidas.length} métrica${escolhidas.length === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
