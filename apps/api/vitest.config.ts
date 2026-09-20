import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    /**
     * Mesmo motivo do web: um processo por arquivo derruba a suíte em máquina ocupada. Aqui
     * NÃO usamos isolate false, porque as suítes de integração abrem conexão com o banco e
     * precisam de estado limpo entre arquivos.
     */
    pool: 'threads',
    poolOptions: { threads: { useAtomics: true } },
    fsModuleCache: true,
  },
});
