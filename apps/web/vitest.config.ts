import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config.ts';

// Configuração separada do Vite: os testes rodam no jsdom com o setup em src/test/setup.ts.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
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
