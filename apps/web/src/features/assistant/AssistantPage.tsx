import { Bot, CircleAlert, CornerDownLeft, FileText, User } from 'lucide-react';
import {
  lazy,
  Suspense,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

import type { AssistantCanvas } from '@inovaapss/shared';

import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useDocuments } from '@/features/documents/api';
import { cn } from '@/lib/utils';

import { type AssistantMessage, useAskAssistant, useAssistantStatus } from './api';

const DecisionCanvas = lazy(() =>
  import('./DecisionCanvas').then((module) => ({ default: module.DecisionCanvas })),
);
const AssistantMessageContent = lazy(() =>
  import('./AssistantMessageContent').then((module) => ({
    default: module.AssistantMessageContent,
  })),
);

/**
 * Perguntas iniciais. Não são enfeite: são as quatro perguntas que o produto promete responder
 * (§1 — com quem falar, por quê, em que ordem e o que fazer) e ensinam, pelo exemplo, o tipo de
 * pergunta que o Agente responde bem.
 */
const STARTERS: readonly string[] = [
  'Com quem eu preciso falar hoje, e por quê?',
  'Quais clientes podem cancelar no próximo mês?',
  'Quanto MRR está ameaçado e em quais contas?',
  'Qual dimensão da carteira está pior: SLA, uso ou NPS?',
];

interface Turn extends AssistantMessage {
  /** Só nas respostas: sobre o que o Agente respondeu. */
  context?: { periodEnd: string; clientsInRanking: number; documentName: string | null };
  /** Artefato visual verificável associado à resposta. */
  canvas?: AssistantCanvas;
}

function Bubble({ turn }: { turn: Turn }) {
  const isUser = turn.role === 'user';
  return (
    <li className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <span
        className={cn(
          'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-muted-foreground',
        )}
        aria-hidden="true"
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </span>
      <div className={cn('min-w-0 max-w-[46rem]', isUser && 'text-right')}>
        <p className="sr-only">{isUser ? 'Você perguntou' : 'O Agente respondeu'}</p>
        <div
          className={cn(
            'inline-block rounded-xl px-3 py-2 text-left text-sm whitespace-pre-wrap',
            isUser ? 'bg-secondary text-secondary-foreground' : 'bg-muted',
          )}
        >
          {isUser ? (
            turn.content
          ) : (
            <Suspense fallback={<span>{turn.content}</span>}>
              <AssistantMessageContent content={turn.content} />
            </Suspense>
          )}
        </div>
        {turn.context === undefined ? null : (
          <p className="mt-1 text-xs text-muted-foreground">
            Com base no relatório de {turn.context.periodEnd || 'período não informado'} ·{' '}
            {turn.context.clientsInRanking} clientes no ranking
            {turn.context.documentName === null ? '' : ` · documento ${turn.context.documentName}`}
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * §38 /assistant — Agente IA: perguntas em português sobre o relatório da carteira.
 *
 * O Agente responde a partir dos MESMOS dados que o dashboard mostra (e, opcionalmente, de um
 * documento enviado). Ele não executa ações: não cria métrica, não muda peso e não importa dado.
 * Por isso a tela é uma conversa, e cada resposta diz de que período e de quantos clientes ela
 * saiu — para a pessoa poder conferir.
 */
export function AssistantPage() {
  const status = useAssistantStatus();
  const ask = useAskAssistant();
  const documents = useDocuments({ page: 1, pageSize: 50 });

  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [documentId, setDocumentId] = useState('');
  const documentSelectId = useId();
  const questionId = useId();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [turns.length, ask.isPending]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 3 || ask.isPending) return;

    // O histórico enviado é o que a pessoa vê na tela — sem a pergunta nova.
    const history = turns.map(({ role, content }) => ({ role, content }));
    setTurns((current) => [...current, { role: 'user', content: trimmed }]);
    setQuestion('');

    const result = await ask
      .mutateAsync({
        question: trimmed,
        ...(documentId === '' ? {} : { documentId }),
        history,
      })
      .catch(() => null);

    if (result === null) return;
    setTurns((current) => [
      ...current,
      {
        role: 'assistant',
        content: result.answer,
        context: result.context,
        canvas: result.canvas,
      },
    ]);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void send(question);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter envia; Shift+Enter quebra linha. É o que se espera de um campo de conversa.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send(question);
    }
  };

  if (status.isPending) {
    return (
      <>
        <PageHeader title="Agente IA" description="Pergunte qualquer coisa sobre o relatório." />
        <div aria-busy="true" aria-label="Carregando o Agente">
          <Skeleton className="h-40 w-full" />
        </div>
      </>
    );
  }

  if (status.data?.configured !== true) {
    return (
      <>
        <PageHeader title="Agente IA" description="Pergunte qualquer coisa sobre o relatório." />
        <EmptyState
          icon={Bot}
          title="O Agente ainda não está ligado"
          description="Defina OPENAI_API_KEY no .env do servidor e reinicie a API. A chave fica só no backend — ela nunca chega ao navegador."
        />
      </>
    );
  }

  const documentOptions = documents.data?.items ?? [];
  const canSend = question.trim().length >= 3 && !ask.isPending;
  const activeCanvas = turns.findLast(
    (turn): turn is Turn & { canvas: AssistantCanvas } => turn.canvas !== undefined,
  )?.canvas;

  return (
    <>
      <PageHeader
        title="Agente IA"
        description="Pergunte em português sobre a carteira. O Agente responde com os dados do relatório — e diz quando não sabe."
      >
        <Badge variant="outline">{status.data.model}</Badge>
      </PageHeader>

      <div
        className={cn(
          'grid items-start gap-6',
          activeCanvas !== undefined && 'xl:grid-cols-[minmax(22rem,0.82fr)_minmax(0,1.18fr)]',
        )}
      >
        <div className="flex min-w-0 flex-col gap-4">
          {turns.length === 0 ? (
            <section className="rounded-xl border border-dashed border-border px-6 py-8">
              <h3 className="text-sm font-semibold">Por onde começar</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                O Agente enxerga os KPIs, a distribuição por classe, a saúde por dimensão, a
                evolução da carteira e o ranking de prioridade com os motivos de cada cliente.
              </p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {STARTERS.map((starter) => (
                  <li key={starter}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void send(starter)}
                    >
                      {starter}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <ul className="flex flex-col gap-5" aria-label="Conversa com o Agente">
              {turns.map((turn, index) => (
                <Bubble key={`${turn.role}-${index}`} turn={turn} />
              ))}
              {ask.isPending ? (
                <li className="flex gap-3" aria-live="polite">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Bot className="size-4" aria-hidden="true" />
                  </span>
                  <span className="rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
                    Lendo o relatório…
                  </span>
                </li>
              ) : null}
            </ul>
          )}

          <div ref={endRef} />

          {ask.isError ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {ask.error instanceof Error ? ask.error.message : 'Não foi possível perguntar agora.'}
            </p>
          ) : null}

          <form onSubmit={onSubmit} className="sticky bottom-0 bg-background pt-2 pb-4">
            {documentOptions.length > 0 ? (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Label htmlFor={documentSelectId} className="text-xs text-muted-foreground">
                  <FileText className="mr-1 inline size-3" aria-hidden="true" />
                  Considerar um documento
                </Label>
                <select
                  id={documentSelectId}
                  className="h-7 rounded-lg border border-border bg-background px-2 text-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  value={documentId}
                  onChange={(event) => setDocumentId(event.target.value)}
                >
                  <option value="">Só o relatório da carteira</option>
                  {documentOptions.map((document) => (
                    <option key={document.id} value={document.id}>
                      {document.fileName}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor={questionId} className="sr-only">
                  Sua pergunta
                </Label>
                <textarea
                  id={questionId}
                  rows={2}
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={onKeyDown}
                  maxLength={2000}
                  placeholder="Ex.: quais clientes do plano Enterprise estão em risco?"
                  className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                />
              </div>
              <Button type="submit" disabled={!canSend}>
                <CornerDownLeft data-icon="inline-start" aria-hidden="true" />
                {ask.isPending ? 'Perguntando…' : 'Perguntar'}
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Enter envia, Shift+Enter quebra linha. O Agente responde sobre o relatório; ele não
              cria métrica nem importa dado.
            </p>
          </form>
        </div>

        {activeCanvas === undefined ? null : (
          <aside className="min-w-0 xl:sticky xl:top-4" aria-label="Canvas analítico da resposta">
            <Suspense fallback={<Skeleton className="h-96 w-full" />}>
              <DecisionCanvas canvas={activeCanvas} />
            </Suspense>
          </aside>
        )}
      </div>
    </>
  );
}
