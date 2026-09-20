/**
 * §43 /calibration — o passado julgando o modelo.
 *
 * Esta tela existe para responder, em português, uma pergunta que ninguém consegue responder
 * olhando pesos: "esses números que a gente escolheu no começo estavam certos?". Por isso ela
 * começa explicando o que a calibração faz, e cada indicador vem com a frase do que ele significa
 * na prática. Número sem contexto aqui seria pior do que número nenhum.
 *
 * Regra que a tela precisa deixar explícita: aceitar sugestão cria um RASCUNHO. A carteira só
 * muda quando alguém ativa a versão (§32).
 */
import { AlertTriangle, Check, Info, Play, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import {
  CALIBRATION_GLOSSARY,
  CALIBRATION_RUN_STATUS_LABELS,
  CALIBRATION_SMALL_SAMPLE_WARNING,
  CALIBRATION_WINDOW_DAYS,
  CALIBRATION_WINDOW_LABELS,
  type ApplyCalibrationSuggestionsResponse,
  type CalibrationBacktestDto,
  type CalibrationRunDto,
  type CalibrationSuggestionDto,
  type CalibrationWindowDays,
} from '@inovaapss/shared';

import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiError } from '@/lib/api';
import { formatInteger } from '@/lib/format';
import { cn } from '@/lib/utils';

import {
  useApplySuggestions,
  useCalibrationRun,
  useCalibrationRuns,
  useCalibrationVersions,
  useRunCalibration,
} from './api';
import { formatWeight, formatWeightDelta } from './format';
import { WeightSlopegraph } from './WeightSlopegraph';

/** `61 %` — taxas vêm do motor como fração 0–1. */
function formatRate(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)} %`;
}

function formatMonths(value: number | null): string {
  if (value === null) return '—';
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${value === 1 ? 'mês' : 'meses'}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Campo nativo com o acabamento do <Input>: h-9, superfície de card e anel de foco (§3 do guia). */
const SELECT_CLASS =
  'h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

/** Um indicador: o número grande, o que ele responde e a frase do que significa na prática. */
function Indicator({
  label,
  value,
  meaning,
  detail,
}: {
  label: string;
  value: string;
  meaning: string;
  detail?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-sm text-muted-foreground">{label}</div>
      {/* Número em texto simples: figuras proporcionais, `tabular-nums` só em tabela
          (DATAVIZ.md §2.2). Encolhe no celular para caber inteiro. */}
      <div className="mt-1 text-xl font-semibold tracking-tight sm:text-3xl">{value}</div>
      {detail ? <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div> : null}
      <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">{meaning}</p>
    </div>
  );
}

function Resultado({ backtest }: { backtest: CalibrationBacktestDto }) {
  const top5 = backtest.topN.find((item) => item.n === 5);
  const top10 = backtest.topN.find((item) => item.n === 10);

  return (
    <div className="grid gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
      <Indicator
        label="Cancelamentos analisados"
        value={formatInteger(backtest.churnsAnalyzed)}
        detail={`${formatInteger(backtest.clientsAnalyzed)} clientes, ${formatInteger(backtest.periodsAnalyzed)} meses de histórico`}
        meaning={CALIBRATION_GLOSSARY.churnsAnalyzed}
      />
      <Indicator
        label="Cancelamentos que o modelo pegou (recall)"
        value={formatRate(backtest.churnDetectionRate)}
        detail={`${formatInteger(backtest.churnsCaught)} de ${formatInteger(backtest.churnsAnalyzed)}`}
        meaning={CALIBRATION_GLOSSARY.churnDetectionRate}
      />
      <Indicator
        label="Alertas que viraram cancelamento (precision)"
        value={formatRate(backtest.precision)}
        detail={`${formatInteger(backtest.truePositives)} certeiros, ${formatInteger(backtest.falsePositives)} em falso`}
        meaning={CALIBRATION_GLOSSARY.precision}
      />
      <Indicator
        label="Taxa de alarme falso"
        value={formatRate(backtest.falsePositiveRate)}
        detail={`${formatInteger(backtest.falsePositives)} alertas em ${formatInteger(backtest.falsePositives + backtest.trueNegatives)} meses tranquilos`}
        meaning={CALIBRATION_GLOSSARY.falsePositiveRate}
      />
      <Indicator
        label="Antecedência do primeiro alerta"
        value={formatMonths(backtest.leadTime.meanPeriods)}
        detail={`mediana de ${formatMonths(backtest.leadTime.medianPeriods)} · ${formatInteger(backtest.leadTime.sampleSize)} casos`}
        meaning={CALIBRATION_GLOSSARY.leadTime}
      />
      <Indicator
        label="Acerto no topo da fila"
        value={`${formatRate(top5?.precision ?? null)} no top 5`}
        detail={`${formatRate(top10?.precision ?? null)} no top 10 · teto do período: ${formatRate(top5?.maxPrecision ?? null)}`}
        meaning={CALIBRATION_GLOSSARY.precisionAtN}
      />
    </div>
  );
}

function TabelaSugestoes({
  suggestions,
  accepted,
  onToggle,
}: {
  suggestions: readonly CalibrationSuggestionDto[];
  accepted: ReadonlySet<string>;
  onToggle: (metricId: string) => void;
}) {
  return (
    // No celular ficam métrica, peso sugerido, mudança e decisão — o resto entra em md/lg.
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Métrica</TableHead>
          <TableHead className="hidden text-right lg:table-cell">Peso atual</TableHead>
          <TableHead className="text-right">Peso sugerido</TableHead>
          <TableHead className="hidden text-right md:table-cell">Importância histórica</TableHead>
          <TableHead className="text-right">Mudança sugerida</TableHead>
          <TableHead className="text-right">Decisão</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {suggestions.map((row) => {
          const aceita = accepted.has(row.metricId);
          return (
            <TableRow key={row.metricId} data-metric-id={row.metricId}>
              <TableCell className="min-w-44 whitespace-normal">
                <div className="font-medium">{row.metricName}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {row.meanHealthChurned === null || row.meanHealthRetained === null
                    ? 'sem observações suficientes para comparar os dois grupos'
                    : `saúde média: ${formatInteger(row.meanHealthChurned)} em quem saiu × ${formatInteger(row.meanHealthRetained)} em quem ficou`}
                </div>
              </TableCell>
              <TableCell className="hidden text-right tabular-nums lg:table-cell">
                {formatWeight(row.currentWeight)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatWeight(row.suggestedWeight)}
              </TableCell>
              <TableCell className="hidden text-right tabular-nums md:table-cell">
                {formatWeight(row.historicalImportance)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatWeightDelta(row.delta)}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  type="button"
                  size="sm"
                  variant={aceita ? 'default' : 'outline'}
                  aria-pressed={aceita}
                  onClick={() => onToggle(row.metricId)}
                >
                  {aceita ? (
                    <>
                      <Check aria-hidden="true" className="size-3.5" /> Aceita
                    </>
                  ) : (
                    'Aceitar'
                  )}
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function CalibrationPage() {
  const navigate = useNavigate();
  const versoes = useCalibrationVersions();
  const execucoes = useCalibrationRuns();
  const rodar = useRunCalibration();
  const aplicar = useApplySuggestions();

  const [windowDays, setWindowDays] = useState<CalibrationWindowDays>(90);
  const [versionId, setVersionId] = useState<string>('');
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [aceitas, setAceitas] = useState<ReadonlySet<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [criada, setCriada] = useState<ApplyCalibrationSuggestionsResponse | null>(null);

  const runId = selecionada ?? rodar.data?.id ?? null;
  const detalhe = useCalibrationRun(runId);
  const run: CalibrationRunDto | undefined = detalhe.data ?? rodar.data ?? undefined;
  const resultados = run?.results ?? null;

  const sugestoes = useMemo(() => resultados?.suggestions ?? [], [resultados]);

  function trocarExecucao(id: string | null) {
    setSelecionada(id);
    setAceitas(new Set());
    setConfirmando(false);
    setCriada(null);
  }

  const erro = rodar.error ?? aplicar.error;
  const mensagemErro =
    erro instanceof ApiError ? erro.message : erro instanceof Error ? erro.message : null;

  return (
    <section className="space-y-6">
      {/* O título desta tela é um h1 de verdade: ela abre com a explicação, não com números.
          O acabamento é o mesmo do <PageHeader>, para não ficar maior que o das outras telas. */}
      <header className="space-y-2.5">
        <h1 className="cn-font-heading text-xl font-semibold tracking-tight text-balance">
          Calibração
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Os pesos das métricas começaram como um palpite informado: alguém decidiu que chamado
          crítico vale mais que reunião desmarcada. A calibração confere esse palpite contra o que
          já aconteceu. Ela roda o modelo mês a mês no passado e pergunta, para cada cliente que
          acabou cancelando: <strong>o sistema teria levantado a mão a tempo?</strong>
        </p>
        <p className="max-w-2xl text-sm text-muted-foreground">
          O resultado diz quantas saídas o modelo teria pego, quantos alarmes teria dado à toa e com
          quanta antecedência teria avisado. A partir daí ele propõe pesos melhores — que{' '}
          <strong>você aprova ou recusa</strong>. Nada é aplicado sozinho.
        </p>
      </header>

      {/* --------------------------------------- controles: empilham no celular */}
      <div className="flex flex-col gap-4 rounded-xl bg-card p-4 shadow-soft ring-1 ring-foreground/5 sm:flex-row sm:flex-wrap sm:items-end sm:p-5">
        <label className="flex w-full min-w-0 flex-col gap-1 text-sm sm:w-56">
          <span className="font-medium">Janela de antecedência</span>
          <select
            className={SELECT_CLASS}
            value={windowDays}
            onChange={(event) => setWindowDays(Number(event.target.value) as CalibrationWindowDays)}
          >
            {CALIBRATION_WINDOW_DAYS.map((dias) => (
              <option key={dias} value={dias}>
                {CALIBRATION_WINDOW_LABELS[dias]}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            um alerta conta como acerto se o cliente sair dentro desse prazo
          </span>
        </label>

        <label className="flex w-full min-w-0 flex-col gap-1 text-sm sm:w-72">
          <span className="font-medium">Versão do modelo</span>
          <select
            className={SELECT_CLASS}
            value={versionId}
            onChange={(event) => setVersionId(event.target.value)}
          >
            <option value="">Versão em vigor</option>
            {(versoes.data?.items ?? []).map((versao) => (
              <option key={versao.metricModelVersionId} value={versao.metricModelVersionId}>
                {versao.metricModelName} v{versao.version}
                {versao.status === 'active' ? ' (em vigor)' : ''}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">
            só aparecem versões que já geraram histórico
          </span>
        </label>

        <Button
          type="button"
          className="w-full sm:w-auto lg:mb-5"
          disabled={rodar.isPending}
          onClick={() => {
            trocarExecucao(null);
            rodar.mutate(
              { windowDays, metricModelVersionId: versionId === '' ? undefined : versionId },
              { onSuccess: (nova) => setSelecionada(nova.id) },
            );
          }}
        >
          <Play aria-hidden="true" className="size-4" />
          {rodar.isPending ? 'Rodando o backtest…' : 'Rodar backtest'}
        </Button>
      </div>

      {mensagemErro ? (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 p-4 text-sm font-medium text-destructive ring-1 ring-destructive/20"
        >
          {mensagemErro}
        </p>
      ) : null}

      {/* ------------------------------------------------------------- resultado */}
      {run === undefined ? (
        <EmptyState
          icon={Play}
          title="Escolha a janela e rode o backtest"
          description="Para ver como o modelo teria se saído com os cancelamentos que já aconteceram."
        />
      ) : run.status !== 'done' || resultados === null ? (
        <p
          className="rounded-xl bg-muted/50 p-4 text-sm ring-1 ring-foreground/5 sm:p-5"
          role="status"
        >
          <strong>{CALIBRATION_RUN_STATUS_LABELS[run.status]}.</strong>{' '}
          {run.errorMessage ?? 'A execução ainda não produziu resultado.'}
        </p>
      ) : (
        <>
          {/* Ressalva de base pequena: é aviso de leitura, não saúde de cliente — nada de âmbar. */}
          <div
            className="flex items-start gap-3 rounded-xl bg-muted/60 p-4 text-sm ring-1 ring-foreground/10"
            role="note"
          >
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            />
            <p>
              <strong>
                {formatInteger(resultados.baseline.churnsAnalyzed)} cancelamentos na base.
              </strong>{' '}
              {CALIBRATION_SMALL_SAMPLE_WARNING}
            </p>
          </div>

          <section
            className="space-y-5 rounded-xl bg-card p-4 shadow-soft ring-1 ring-foreground/5 sm:p-5"
            aria-label="Desempenho do modelo em vigor"
          >
            <h2 className="cn-font-heading text-base font-medium text-balance">
              Como o modelo em vigor teria se saído — janela de {formatInteger(run.windowDays)} dias
            </h2>
            <Resultado backtest={resultados.baseline} />
            <p className="text-xs text-muted-foreground">
              {CALIBRATION_GLOSSARY.recall} Neste recorte: {formatRate(resultados.baseline.recall)}{' '}
              dos meses que antecederam uma saída tiveram alerta. Consideramos "alerta" o cliente
              com risco de {formatInteger(resultados.baseline.alertRiskThreshold)} ou mais (saúde de{' '}
              {formatInteger(100 - resultados.baseline.alertRiskThreshold)} para baixo).
            </p>
          </section>

          <section
            className="space-y-5 rounded-xl bg-card p-4 shadow-soft ring-1 ring-foreground/5 sm:p-5"
            aria-label="Pesos sugeridos pelo histórico"
          >
            <h2 className="cn-font-heading text-base font-medium">
              Pesos sugeridos pelo histórico
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              A importância histórica mede o quanto cada métrica separou, no passado, quem cancelou
              de quem ficou. A proposta anda metade do caminho entre o peso de hoje e essa
              importância — com poucas saídas na base, mudar tudo de uma vez seria confiar demais em
              pouca evidência.
            </p>

            <WeightSlopegraph suggestions={sugestoes} accepted={aceitas} />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAceitas(new Set(sugestoes.map((s) => s.metricId)))}
              >
                Aceitar todas
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setAceitas(new Set())}>
                Manter os pesos atuais
              </Button>
              <span className="w-full text-xs text-muted-foreground sm:w-auto">
                {aceitas.size === 0
                  ? 'nenhuma sugestão aceita'
                  : `${formatInteger(aceitas.size)} de ${formatInteger(sugestoes.length)} sugestões aceitas`}
              </span>
            </div>

            <TabelaSugestoes
              suggestions={sugestoes}
              accepted={aceitas}
              onToggle={(metricId) =>
                setAceitas((atual) => {
                  const proximo = new Set(atual);
                  if (proximo.has(metricId)) proximo.delete(metricId);
                  else proximo.add(metricId);
                  return proximo;
                })
              }
            />

            {/* Fecho da seção: separador em vez de caixa, para não virar card dentro de card. */}
            <div className="space-y-4 border-t border-border pt-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  disabled={aceitas.size === 0 || aplicar.isPending}
                  onClick={() => setConfirmando(true)}
                >
                  <Plus aria-hidden="true" className="size-4" />
                  Criar nova versão
                </Button>
                <p className="min-w-0 text-sm text-muted-foreground">
                  A versão nasce como <strong>rascunho</strong>. A carteira continua sendo pontuada
                  pela versão em vigor até alguém ativar a nova em Modelos de métricas.
                </p>
              </div>

              {confirmando ? (
                <div
                  className="space-y-3 rounded-lg bg-muted/60 p-4 text-sm ring-1 ring-foreground/10"
                  role="dialog"
                >
                  <p>
                    Criar um rascunho com {formatInteger(aceitas.size)} peso(s) sugerido(s)? As
                    métricas não aceitas mantêm a proporção entre si, e a soma fecha 100 %.{' '}
                    <strong>Nada muda na carteira agora.</strong>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={aplicar.isPending}
                      onClick={() => {
                        aplicar.mutate(
                          { runId: run.id, acceptedMetricIds: [...aceitas] },
                          {
                            onSuccess: (resposta) => {
                              setCriada(resposta);
                              setConfirmando(false);
                            },
                          },
                        );
                      }}
                    >
                      {aplicar.isPending ? 'Criando…' : 'Sim, criar o rascunho'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmando(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : null}

              {criada ? (
                <div
                  className="flex flex-wrap items-center gap-3 rounded-lg bg-primary/5 p-4 text-sm ring-1 ring-primary/20"
                  role="status"
                >
                  <Info aria-hidden="true" className="size-4 shrink-0" />
                  <p className="min-w-0 flex-1">{criada.message}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/metric-models/${criada.metricModelId}`)}
                  >
                    Abrir o modelo
                  </Button>
                </div>
              ) : null}
            </div>
          </section>

          <section
            className="space-y-5 rounded-xl bg-card p-4 shadow-soft ring-1 ring-foreground/5 sm:p-5"
            aria-label="Desempenho estimado da proposta"
          >
            <h2 className="cn-font-heading text-base font-medium">
              Se os pesos sugeridos já valessem
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Mesmo histórico, mesma janela, mesma régua de alerta — só os pesos mudam. Serve para
              comparar, não para prometer: a proposta foi ajustada olhando justamente estes
              cancelamentos, então ela tende a parecer melhor aqui do que seria no futuro.
            </p>
            <Resultado backtest={resultados.proposed} />
          </section>
        </>
      )}

      {/* ------------------------------------------------------------- histórico */}
      <section className="space-y-4 rounded-xl bg-card p-4 shadow-soft ring-1 ring-foreground/5 sm:p-5">
        <h2 className="cn-font-heading text-base font-medium">Execuções anteriores</h2>
        {(execucoes.data?.items ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma calibração rodada até agora.</p>
        ) : (
          // No celular sobram quando, quantos cancelamentos pegou e o botão de abrir.
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead className="hidden lg:table-cell">Modelo</TableHead>
                <TableHead className="hidden text-right md:table-cell">Janela</TableHead>
                <TableHead className="text-right">Cancelamentos pegos</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Precisão</TableHead>
                <TableHead className="hidden md:table-cell">Situação</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(execucoes.data?.items ?? []).map((item) => (
                <TableRow
                  key={item.id}
                  className={cn(item.id === runId && 'bg-muted/50')}
                  data-run-id={item.id}
                >
                  <TableCell className="tabular-nums whitespace-nowrap">
                    {formatDateTime(item.createdAt)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {item.metricModelName ?? '—'}
                    {item.version === null ? '' : ` v${item.version}`}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">
                    {formatInteger(item.windowDays)} dias
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {item.churnsCaught === null || item.churnsAnalyzed === null
                      ? '—'
                      : `${formatInteger(item.churnsCaught)} de ${formatInteger(item.churnsAnalyzed)}`}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {formatRate(item.precision)}
                  </TableCell>
                  <TableCell className="hidden whitespace-normal md:table-cell">
                    {CALIBRATION_RUN_STATUS_LABELS[item.status]}
                    {item.errorMessage ? (
                      <span className="block text-xs text-muted-foreground">
                        {item.errorMessage}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => trocarExecucao(item.id)}
                    >
                      Ver
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </section>
  );
}
