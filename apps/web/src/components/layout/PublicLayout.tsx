import { Outlet } from 'react-router';

/** Moldura das telas públicas (/login, /forgot-password): um card centralizado. */
export function PublicLayout() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="mb-8 text-center">
        <p className="text-lg font-semibold tracking-tight">INOVAAPPS</p>
        <p className="text-sm text-muted-foreground">Saúde, risco e prioridade da carteira</p>
      </div>
      <div className="w-full max-w-sm">
        <Outlet />
      </div>
    </main>
  );
}
