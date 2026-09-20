import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config.ts';

// Configuração separada do Vite: os testes rodam no jsdom com o setup em src/test/setup.ts.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      /**
       * Como a suíte roda. O padrão do vitest é um PROCESSO por arquivo de teste: com 19
       * arquivos isso vira 19 processos, cada um subindo o jsdom do zero. Em máquina ocupada
       * eles não respondem a tempo e a suíte inteira morre em "Timeout waiting for worker",
       * sem rodar um único teste. Linha de execução é bem mais leve que processo, e o vitest
       * já limita a quantidade ao número de núcleos.
       *
       * NÃO usar isolate: false aqui. Já foi tentado: reaproveitar a linha entre arquivos faz
       * o estado de um teste vazar para o seguinte e derruba RequireAuth.test.tsx, que depende
       * de começar sem sessão. O ganho seria de poucos segundos; a confiança vale mais.
       */
      pool: 'threads',
      /** Guarda a transformação entre execuções: a segunda rodada não recompila tudo de novo. */
      fsModuleCache: true,
      globals: false,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
      /**
       * Os testes de tela conferem o que a interface desenha, não a rede: eles montam a
       * expectativa a partir de `@/lib/mock/*` e precisam que as telas leiam a MESMA fonte.
       * Sem fixar isto, VITE_DATA_SOURCE cai no padrão 'api', cada tela tenta um fetch real,
       * `data` vem `undefined` e 20 testes quebram em "Cannot destructure ... of data.forecast".
       * O padrão de produção continua sendo 'api' (.env.example).
       */
      env: { VITE_DATA_SOURCE: 'mock' },
    },
  }),
);
