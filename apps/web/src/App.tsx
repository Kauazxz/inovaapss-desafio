import { QueryClientProvider } from '@tanstack/react-query';

import { queryClient } from '@/lib/query-client';
import { AppRoutes } from '@/routes';

/**
 * Raiz do app: provedores globais + rotas.
 * O Router fica fora (main.tsx usa BrowserRouter; os testes usam MemoryRouter).
 */
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppRoutes />
    </QueryClientProvider>
  );
}
