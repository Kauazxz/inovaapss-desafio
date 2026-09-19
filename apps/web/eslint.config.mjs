// Reaproveita a config da raiz e acrescenta só o que é específico de React.
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

import rootConfig from '../../eslint.config.mjs';

export default defineConfig([
  ...rootConfig,

  // Imports com o alias "@/..." contam como internos na ordenação (depois dos externos).
  { settings: { 'import-x/internal-regex': '^@/' } },

  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.flat.recommended.rules },
  },

  {
    files: ['**/*.tsx'],
    plugins: { 'react-refresh': reactRefresh },
    rules: {
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
    },
  },

  {
    // Componentes do shadcn/ui exportam variantes junto com o componente; é o padrão deles.
    files: ['src/components/ui/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
]);
