import { useState } from 'react';

import type { ImportMapping } from '@inovaapss/validation';

import { PageHeader } from '@/components/page-header';
import { cn } from '@/lib/utils';

import {
  type ConfirmImportResult,
  type ImportDatasetKey,
  type ImportJob,
  type ImportSheet,
  type PreviewImportResult,
  useConfirmImport,
  useDatasets,
  usePreviewImport,
  useUploadImport,
} from './api';
import { ImportHistory } from './ImportHistory';
import { MappingStep } from './MappingStep';
import { PreviewStep } from './PreviewStep';
import { ResultStep } from './ResultStep';
import { UploadStep } from './UploadStep';

/** Os quatro passos do §34, na ordem em que a pessoa passa por eles. */
const STEPS = ['Arquivo', 'Mapeamento', 'Prévia', 'Resultado'] as const;

type Stage =
  | { kind: 'upload' }
  | { kind: 'mapping'; job: ImportJob; sheets: ImportSheet[] }
  | {
      kind: 'preview';
      job: ImportJob;
      sheets: ImportSheet[];
      result: PreviewImportResult;
    }
  | { kind: 'done'; result: ConfirmImportResult };

const STAGE_INDEX: Readonly<Record<Stage['kind'], number>> = {
  upload: 0,
  mapping: 1,
  preview: 2,
  done: 3,
};

function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="mb-6 flex flex-wrap gap-x-6 gap-y-2" aria-label="Passos da importação">
      {STEPS.map((label, index) => (
        <li
          key={label}
          aria-current={index === current ? 'step' : undefined}
          className={cn(
            'flex items-center gap-2 text-sm',
            index === current ? 'font-medium text-foreground' : 'text-muted-foreground',
          )}
        >
          <span
            className={cn(
              'flex size-5 items-center justify-center rounded-full text-xs tabular-nums',
              index < current && 'bg-muted text-muted-foreground',
              index === current && 'bg-primary text-primary-foreground',
              index > current && 'border border-border',
            )}
            aria-hidden="true"
          >
            {index + 1}
          </span>
          {label}
        </li>
      ))}
    </ol>
  );
}

/** Mensagem de erro de uma mutation, já pronta para a tela. */
function errorMessage(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  return error instanceof Error ? error.message : 'Algo deu errado. Tente de novo.';
}

/**
 * §38 /import — importador de dados (§34 + A4: XLSX, CSV e JSON).
 *
 * Quatro passos, um de cada vez: enviar o arquivo, dizer de onde vem cada campo, conferir a
 * prévia com os erros linha a linha e confirmar. Nada é gravado antes da confirmação, e a
 * confirmação revalida o arquivo no servidor — a prévia é para a pessoa decidir, não é a fonte
 * da verdade.
 */
export function ImportPage() {
  const [stage, setStage] = useState<Stage>({ kind: 'upload' });
  const [sheetName, setSheetName] = useState('');
  const [dataset, setDataset] = useState<ImportDatasetKey | ''>('');
  const [mapping, setMapping] = useState<ImportMapping>({});

  const upload = useUploadImport();
  const preview = usePreviewImport();
  const confirm = useConfirmImport();
  const datasets = useDatasets();

  /** Ao escolher a tabela ou o tipo de dado, o mapeamento sugerido correspondente entra junto. */
  const selectSuggestion = (sheets: ImportSheet[], nextSheet: string, nextDataset?: string) => {
    const sheet = sheets.find((item) => item.name === nextSheet) ?? sheets[0];
    if (sheet === undefined) return;
    const suggestion =
      (nextDataset === undefined
        ? undefined
        : sheet.suggestions.find((item) => item.dataset === nextDataset)) ?? sheet.suggestions[0];
    if (suggestion === undefined) return;
    setSheetName(sheet.name);
    setDataset(suggestion.dataset);
    setMapping({ ...suggestion.mapping });
  };

  const onFile = async (file: File) => {
    upload.reset();
    const result = await upload.mutateAsync(file).catch(() => null);
    if (result === null) return;
    selectSuggestion(result.sheets, result.sheets[0]?.name ?? '');
    setStage({ kind: 'mapping', job: result.job, sheets: result.sheets });
  };

  const onPreview = async () => {
    if (stage.kind !== 'mapping' || dataset === '') return;
    preview.reset();
    const result = await preview
      .mutateAsync({ id: stage.job.id, body: { sheet: sheetName, dataset, mapping } })
      .catch(() => null);
    if (result === null) return;
    setStage({ kind: 'preview', job: stage.job, sheets: stage.sheets, result });
  };

  const onConfirm = async (ignoreInvalidRows: boolean) => {
    if (stage.kind !== 'preview') return;
    confirm.reset();
    const result = await confirm
      .mutateAsync({ id: stage.job.id, body: { ignoreInvalidRows } })
      .catch(() => null);
    if (result === null) return;
    setStage({ kind: 'done', result });
  };

  const restart = () => {
    upload.reset();
    preview.reset();
    confirm.reset();
    setSheetName('');
    setDataset('');
    setMapping({});
    setStage({ kind: 'upload' });
  };

  const currentSheets = stage.kind === 'mapping' || stage.kind === 'preview' ? stage.sheets : [];
  const currentSuggestion = currentSheets
    .find((sheet) => sheet.name === sheetName)
    ?.suggestions.find((item) => item.dataset === dataset);

  return (
    <>
      <PageHeader
        title="Importar dados"
        description="Planilhas de clientes, atendimento mensal, NPS e cancelamentos entram por aqui — com conferência antes de gravar."
      />

      <StepIndicator current={STAGE_INDEX[stage.kind]} />

      {stage.kind === 'upload' ? (
        <UploadStep
          onFile={(file) => void onFile(file)}
          uploading={upload.isPending}
          error={errorMessage(upload.error)}
        />
      ) : null}

      {stage.kind === 'mapping' ? (
        <MappingStep
          sheets={stage.sheets}
          sheetName={sheetName}
          onSheetChange={(name) => selectSuggestion(stage.sheets, name)}
          dataset={dataset}
          onDatasetChange={(next) => selectSuggestion(stage.sheets, sheetName, next)}
          mapping={mapping}
          onMappingChange={setMapping}
          catalog={datasets.data}
          onBack={restart}
          onPreview={() => void onPreview()}
          previewing={preview.isPending}
          error={errorMessage(preview.error)}
        />
      ) : null}

      {stage.kind === 'preview' ? (
        <PreviewStep
          result={stage.result}
          suggestion={currentSuggestion}
          onBack={() => setStage({ kind: 'mapping', job: stage.job, sheets: stage.sheets })}
          onConfirm={(ignoreInvalidRows) => void onConfirm(ignoreInvalidRows)}
          confirming={confirm.isPending}
          error={errorMessage(confirm.error)}
        />
      ) : null}

      {stage.kind === 'done' ? <ResultStep result={stage.result} onRestart={restart} /> : null}

      {stage.kind === 'upload' ? (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold">Importações anteriores</h2>
          <ImportHistory />
        </section>
      ) : null}
    </>
  );
}
