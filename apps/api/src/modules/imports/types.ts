/**
 * Tipos da importação de dados (§34). Os DTOs públicos vivem em `@inovaapss/shared` (API e web
 * compartilham); aqui ficam só os que não saem da API.
 */
import type { ImportJobDto } from '@inovaapss/shared';

/** Linha completa do job, com o caminho interno do storage (nunca vai na resposta). */
export interface ImportJobRecord extends ImportJobDto {
  filePath: string;
}

export interface UploadImportInput {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}
