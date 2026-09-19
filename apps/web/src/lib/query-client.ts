import { QueryClient } from '@tanstack/react-query';

/** Um único QueryClient para o app (ver App.tsx). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
