/**
 * /import (§38) — o fluxo da §34 numa tela só:
 *
 *   arquivo → mapeamento → prévia → confirmação → resultado
 *
 * Cada passo só libera o seguinte, e o caminho de volta está sempre aberto: mapear errado é
 * normal, e corrigir precisa custar um clique, não uma reimportação. Nada é gravado até a
 * confirmação — a prévia existe justamente para a pessoa ver o que vai acontecer antes.
 */
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Check, CircleAlert, CircleCheck, Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { IMPORT_DATASET_KEYS, IMPORT_DATASET_LABELS } from '@inovaapss/shared';
import type {
  ImportConfirmDto,
  ImportDatasetKey,
  ImportPreviewDto,
  ImportSheetDto,
  ImportUploadDto,
} from '@inovaapss/shared';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { extractMetrics, fetchDocuments } from '@/features/documents/api';
import { cn } from '@/lib/utils';

import { type SheetSelection, useConfirmImport, usePreviewImport, useUploadImport } from './api';
import { formatCount, formatFileSize } from './format';
import { ImportDropzone, type RejectedImportFile } from './ImportDropzone';
import { ImportHistory } from './ImportHistory';
import { MappingTable } from './MappingTable';
import { PreviewSummary } from './PreviewSummary';

type Step = 'file' | 'mapping' | 'preview' | 'done';

const STEPS: { key: Step; label: string }[] = [
  { key: 'file', label: '1. Arquivo' },
  { key: 'mapping', label: '2. Colunas' },
  { key: 'preview', label: '3. Conferência' },
  { key: 'done', label: '4. Resultado' },
];

/**
 * Onde a pessoa está no fluxo. Pílulas em vez de texto solto: o passo atual usa a pílula de
 * realce da barra de navegação (§1 do guia), os já vencidos levam o sinal de feito, e no
 * celular a fila quebra em duas linhas em vez de cortar o último passo.
 */
function StepBar({ current }: { current: Step }) {
  const index = STEPS.findIndex((step) => step.key === current);
  return (
    <ol
      className="mb-6 flex flex-wrap items-center gap-1.5 text-xs sm:gap-2 sm:text-sm"
      aria-label="Passos da importação"
    >
      {STEPS.map((step, position) => (
        <li
          key={step.key}
          aria-current={step.key === current ? 'step' : undefined}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 whitespace-nowrap transition-colors',
            position < index && 'bg-muted text-muted-foreground',
            position === index && 'bg-accent font-medium text-accent-foreground',
            position > index && 'text-muted-foreground',
          )}
        >
          {position < index ? <Check className="size-3.5 shrink-0" aria-hidden="true" /> : null}
          {step.label}
        </li>
      ))}
    </ol>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function ImportPage() {
  const [step, setStep] = useState<Step>('file');
  const [upload, setUpload] = useState<ImportUploadDto | null>(null);
  const [selections, setSelections] = useState<SheetSelection[]>([]);
  const [preview, setPreview] = useState<ImportPreviewDto | null>(null);
  const [result, setResult] = useState<ImportConfirmDto | null>(null);
  const navigate = useNavigate();

  /**
   * O elo que faltava entre importar e medir: a planilha já ficou arquivada no acervo com o id
   * desta importação, então dá para achá-la, mandar a IA lê-la e levar a pessoa direto para as
   * sugestões — em vez de pedir que ela adivinhe o caminho por Documentos.
   */
  const analisar = useMutation({
    mutationFn: async (importJobId: string) => {
      const pagina = await fetchDocuments({ page: 1, pageSize: 50, origin: 'import' });
      const arquivo = pagina.items.find((item) => item.importJobId === importJobId);
      if (arquivo === undefined) {
        throw new Error(
          'A planilha ainda não apareceu no acervo da organização. Abra Documentos e analise por lá.',
        );
      }
      await extractMetrics(arquivo.id);
      return arquivo.id;
    },
    onSuccess: (documentId) => {
      void navigate(`/documents/${documentId}`);
    },
  });
  const [rejected, setRejected] = useState<RejectedImportFile | null>(null);

  const uploadMutation = useUploadImport();
  const previewMutation = usePreviewImport();
  const confirmMutation = useConfirmImport();

  const reset = () => {
    setStep('file');
    setUpload(null);
    setSelections([]);
    setPreview(null);
    setResult(null);
    setRejected(null);
    uploadMutation.reset();
    previewMutation.reset();
    confirmMutation.reset();
  };

  /** Envia o arquivo e já monta a seleção inicial com o que a API detectou. */
  const onAccepted = async (file: File) => {
    setRejected(null);
    const uploaded = await uploadMutation.mutateAsync(file).catch(() => null);
    if (uploaded === null) return;
    setUpload(uploaded);
    setSelections(
      uploaded.sheets
        .filter(
          (sheet): sheet is ImportSheetDto & { detectedDataset: ImportDatasetKey } =>
            sheet.detectedDataset !== null,
        )
        .map((sheet) => ({ sheet: sheet.name, dataset: sheet.detectedDataset })),
    );
    setStep('mapping');
  };

  /** Valida sem gravar. O mapeamento da prévia é o que a confirmação vai usar. */
  const runPreview = async (next: SheetSelection[] = selections) => {
    if (upload === null) return;
    const done = await previewMutation
      .mutateAsync({ id: upload.job.id, sheets: next.length > 0 ? next : undefined })
      .catch(() => null);
    if (done === null) return;
    setPreview(done);
    // A prévia devolve o mapeamento efetivo de cada tabela: é dele que a correção parte.
    setSelections(
      done.sheets.map((sheet) => ({
        sheet: sheet.sheet,
        dataset: sheet.dataset,
        mapping: sheet.mapping,
      })),
    );
    setStep('preview');
  };

  const onConfirm = async () => {
    if (upload === null) return;
    const done = await confirmMutation
      .mutateAsync({ id: upload.job.id, sheets: selections.length > 0 ? selections : undefined })
      .catch(() => null);
    if (done === null) return;
    setResult(done);
    setStep('done');
  };

  const changeDataset = (sheetName: string, dataset: ImportDatasetKey | null) => {
    setSelections((current) => {
      const without = current.filter((item) => item.sheet !== sheetName);
      // Trocar o conjunto de dados invalida o mapeamento anterior: a API sugere de novo.
      return dataset === null ? without : [...without, { sheet: sheetName, dataset }];
    });
  };

  const changeMapping = (sheetName: string, field: string, header: string | null) => {
    setSelections((current) =>
      current.map((item) =>
        item.sheet === sheetName
          ? { ...item, mapping: { ...(item.mapping ?? {}), [field]: header } }
          : item,
      ),
    );
  };

  const podeConferir = selections.length > 0;
  const bloqueado = (preview?.counts.missingFields.length ?? 0) > 0;

  return (
    <>
      <PageHeader
        title="Importar dados"
        description="Planilhas e arquivos de chamados, uso, pagamentos, reuniões e NPS entram por aqui. Nada é gravado antes da sua confirmação."
      >
        {step !== 'file' ? (
          <Button type="button" variant="outline" onClick={reset}>
            Começar de novo
          </Button>
        ) : null}
      </PageHeader>

      <StepBar current={step} />

      {/* ---------------------------------------------------------- 1. arquivo */}
      {step === 'file' ? (
        <section className="space-y-3" aria-labelledby="arquivo-titulo">
          <h3 id="arquivo-titulo" className="sr-only">
            Enviar arquivo
          </h3>
          <ImportDropzone
            onAccepted={(file) => void onAccepted(file)}
            onRejected={setRejected}
            disabled={uploadMutation.isPending}
          />
          {uploadMutation.isPending ? (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Enviando e lendo o arquivo…
            </p>
          ) : null}
          {rejected !== null ? (
            <p role="alert" className="text-sm text-destructive">
              {rejected.fileName}: {rejected.reason}
            </p>
          ) : null}
          {uploadMutation.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(uploadMutation.error, 'Não foi possível enviar o arquivo.')}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ---------------------------------------------------------- 2. colunas */}
      {step === 'mapping' && upload !== null ? (
        <section className="space-y-6" aria-labelledby="colunas-titulo">
          <Card>
            <CardHeader>
              <h3
                id="colunas-titulo"
                className="cn-font-heading text-base leading-snug font-medium"
              >
                O que há no arquivo
              </h3>
              <p className="text-sm text-muted-foreground">
                {upload.job.fileName} · {formatFileSize(upload.job.sizeBytes)} ·{' '}
                {upload.sheets.length === 1
                  ? '1 tabela'
                  : `${formatCount(upload.sheets.length)} tabelas`}
              </p>
            </CardHeader>
            <CardContent>
              {/* Uma tabela por linha: nome e prévia dos cabeçalhos à esquerda, o que fazer com
                  ela à direita — no celular um em cima do outro, com o campo em largura total. */}
              <ul className="divide-y divide-border">
                {upload.sheets.map((sheet) => {
                  const selection = selections.find((item) => item.sheet === sheet.name);
                  return (
                    <li
                      key={sheet.name}
                      className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{sheet.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {formatCount(sheet.rowCount)} linhas ·{' '}
                          {sheet.headers.slice(0, 4).join(', ')}
                          {sheet.headers.length > 4 ? '…' : ''}
                        </div>
                      </div>
                      <div className="w-full sm:w-auto sm:shrink-0">
                        <label className="sr-only" htmlFor={`dataset-${sheet.name}`}>
                          Conjunto de dados da tabela {sheet.name}
                        </label>
                        <select
                          id={`dataset-${sheet.name}`}
                          className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-auto"
                          value={selection?.dataset ?? ''}
                          onChange={(event) =>
                            changeDataset(
                              sheet.name,
                              event.target.value === ''
                                ? null
                                : (event.target.value as ImportDatasetKey),
                            )
                          }
                        >
                          <option value="">— não importar —</option>
                          {IMPORT_DATASET_KEYS.map((key) => (
                            <option key={key} value={key}>
                              {IMPORT_DATASET_LABELS[key]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={!podeConferir || previewMutation.isPending}
              onClick={() => void runPreview()}
            >
              {previewMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Conferir antes de importar
            </Button>
            {!podeConferir ? (
              <span className="text-sm text-muted-foreground">
                Escolha o conjunto de dados de ao menos uma tabela.
              </span>
            ) : null}
          </div>

          {previewMutation.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(previewMutation.error, 'Não foi possível conferir o arquivo.')}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ---------------------------------------------------------- 3. conferência */}
      {step === 'preview' && preview !== null && upload !== null ? (
        <section className="space-y-6" aria-labelledby="conferencia-titulo">
          <h3 id="conferencia-titulo" className="sr-only">
            Conferência antes de importar
          </h3>

          <PreviewSummary preview={preview} />

          <div className="space-y-4">
            <h4 className="cn-font-heading text-base font-medium">Colunas por tabela</h4>
            {preview.sheets.map((sheet) => {
              const headers =
                upload.sheets.find((item) => item.name === sheet.sheet)?.headers ?? [];
              return (
                <MappingTable
                  key={sheet.sheet}
                  sheet={sheet}
                  headers={headers}
                  onChange={(field, header) => changeMapping(sheet.sheet, field, header)}
                  disabled={previewMutation.isPending || confirmMutation.isPending}
                />
              );
            })}
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={previewMutation.isPending}
              onClick={() => void runPreview()}
            >
              Revalidar com estas colunas
            </Button>
          </div>

          {/* A decisão mora numa faixa só, para não se perder no fim de uma página longa. */}
          <div className="flex flex-col gap-3 rounded-2xl bg-card p-5 shadow-soft ring-1 ring-foreground/5 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setStep('mapping')}
            >
              <ArrowLeft aria-hidden="true" />
              Voltar
            </Button>
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={bloqueado || preview.counts.valid === 0 || confirmMutation.isPending}
              onClick={() => void onConfirm()}
            >
              {confirmMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Importar {formatCount(preview.counts.valid)} linhas
            </Button>
            {preview.counts.valid === 0 ? (
              <span className="text-sm text-muted-foreground">
                Nenhuma linha válida para importar.
              </span>
            ) : null}
          </div>

          {confirmMutation.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(confirmMutation.error, 'Não foi possível importar.')}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ---------------------------------------------------------- 4. resultado */}
      {step === 'done' && result !== null ? (
        <section className="space-y-6" aria-labelledby="resultado-titulo">
          <div className="flex items-start gap-3 rounded-2xl bg-card p-5 shadow-soft ring-1 ring-foreground/5 sm:gap-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <CircleCheck className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 id="resultado-titulo" className="cn-font-heading text-base font-medium">
                Importação concluída
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatCount(result.result.clientsCreated)} clientes novos ·{' '}
                {formatCount(result.result.clientsUpdated)} atualizados ·{' '}
                {formatCount(result.result.clientsCancelled)} cancelados ·{' '}
                {formatCount(result.result.metricValues)} valores de métrica.
              </p>
              {result.result.rowErrors > 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatCount(result.result.rowErrors)} linhas ficaram de fora e estão guardadas
                  nesta importação, com o motivo de cada uma.
                </p>
              ) : null}
              {result.result.recalculation !== null ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {result.result.recalculation.skippedReason === undefined
                    ? `Scores recalculados para ${formatCount(result.result.recalculation.clients)} clientes.`
                    : `O recálculo não rodou: ${result.result.recalculation.skippedReason}`}
                </p>
              ) : null}
            </div>
          </div>

          {result.result.skipped.length > 0 ? (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Ficou de fora: {result.result.skipped.join('; ')}.
            </p>
          ) : null}

          {analisar.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {analisar.error instanceof Error
                ? analisar.error.message
                : 'Não foi possível analisar o arquivo.'}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3">
            <Button
              type="button"
              className="w-full sm:w-auto"
              disabled={upload === null || analisar.isPending}
              onClick={() => {
                if (upload !== null) analisar.mutate(upload.job.id);
              }}
            >
              {analisar.isPending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles aria-hidden="true" />
              )}
              {analisar.isPending ? 'Analisando…' : 'Analisar o arquivo e sugerir métricas'}
            </Button>
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link to="/dashboard">Ver o dashboard</Link>
            </Button>
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link to="/clients">Ver os clientes</Link>
            </Button>
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={reset}>
              Importar outro arquivo
            </Button>
          </div>
        </section>
      ) : null}

      {/* ---------------------------------------------------------- histórico */}
      <section className="mt-10 space-y-4" aria-labelledby="historico-titulo">
        <h3 id="historico-titulo" className="cn-font-heading text-base font-medium">
          Importações anteriores
        </h3>
        <ImportHistory />
      </section>
    </>
  );
}
