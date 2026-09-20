/**
 * Erro de leitura: o arquivo não pôde ser interpretado (JSON inválido, CSV vazio, aba
 * inexistente). Erros de DADO nunca viram exceção — entram no `ImportReport` linha a linha.
 */
export class ImportReadError extends Error {
  override readonly name: string = 'ImportReadError';

  constructor(message: string) {
    super(message);
  }
}
