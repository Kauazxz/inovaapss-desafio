import { Activity } from 'lucide-react';
import { Outlet } from 'react-router';

/** Moldura das telas públicas (/login, /forgot-password): um card centralizado. */
export function PublicLayout() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground">
      {/* Halo na cor de ação: dá profundidade à tela de entrada sem pesar. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 size-144 -translate-x-1/2 rounded-full bg-primary/8 blur-3xl"
      />

      <div className="relative mb-8 flex flex-col items-center text-center">
        <span
          className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft"
          aria-hidden="true"
        >
          <Activity className="size-6" />
        </span>
        <p className="cn-font-heading text-xl font-semibold tracking-tight">INOVAAPPS</p>
        <p className="mt-1 text-sm text-muted-foreground">Saúde, risco e prioridade da carteira</p>
      </div>
      <div className="relative w-full max-w-sm">
        <Outlet />
      </div>
    </main>
  );
}
