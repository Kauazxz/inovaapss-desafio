import { Upload } from 'lucide-react';
import { type DragEvent, useId, useRef, useState } from 'react';

import { IMPORT_ACCEPT_ATTRIBUTE, IMPORT_MAX_UPLOAD_BYTES } from '@inovaapss/shared';
import { resolveImportFileType } from '@inovaapss/validation';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { formatFileSize } from './format';

export interface RejectedImportFile {
  fileName: string;
  reason: string;
}

interface ImportDropzoneProps {
  /** Arquivo que passou na validação local (extensão, MIME e tamanho). */
  onAccepted(file: File): void;
  onRejected?(rejected: RejectedImportFile): void;
  disabled?: boolean;
}

/** A mesma allowlist da API (§45), aplicada aqui para o erro aparecer antes de subir 20 MB. */
function validate(file: File): RejectedImportFile | null {
  const resolved = resolveImportFileType(file.name, file.type);
  if (!resolved.ok) return { fileName: file.name, reason: resolved.reason };
  if (file.size === 0) return { fileName: file.name, reason: 'O arquivo está vazio.' };
  if (file.size > IMPORT_MAX_UPLOAD_BYTES) {
    return {
      fileName: file.name,
      reason: `Arquivo com ${formatFileSize(file.size)}; o limite é ${formatFileSize(IMPORT_MAX_UPLOAD_BYTES)}.`,
    };
  }
  return null;
}

/** Arrastar/soltar ou escolher um arquivo de dados (XLSX, CSV ou JSON — §34 + A4). */
export function ImportDropzone({ onAccepted, onRejected, disabled = false }: ImportDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (list: FileList | null) => {
    const file = list?.[0];
    if (!file) return;
    const rejected = validate(file);
    if (rejected !== null) onRejected?.(rejected);
    else onAccepted(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    handleFiles(event.dataTransfer.files);
  };

  return (
    <div
      role="group"
      aria-label="Enviar arquivo de dados"
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center transition-colors',
        dragging ? 'border-primary bg-primary/5' : 'border-border',
        disabled && 'opacity-60',
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Upload className="size-5" aria-hidden="true" />
      </span>
      <div>
        <p className="text-sm font-medium">Arraste a planilha para cá ou escolha no computador</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Aceitos: XLSX, CSV e JSON · até {formatFileSize(IMPORT_MAX_UPLOAD_BYTES)}
        </p>
      </div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={IMPORT_ACCEPT_ATTRIBUTE}
        className="sr-only"
        aria-label="Escolher arquivo"
        disabled={disabled}
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        Escolher arquivo
      </Button>
    </div>
  );
}
