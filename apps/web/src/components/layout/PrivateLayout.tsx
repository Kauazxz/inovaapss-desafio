import { LogOut } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { findNavItem, NAV_ITEMS } from '@/routes/nav';

const linkBase =
  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/80 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50';
const linkActive = 'bg-sidebar-accent text-sidebar-accent-foreground';

/**
 * Layout das rotas privadas (§38): sidebar com os itens de navegação, cabeçalho e conteúdo.
 * Desktop-first; em telas pequenas a sidebar vira uma barra rolável abaixo do cabeçalho.
 */
export function PrivateLayout() {
  const { pathname } = useLocation();
  const current = findNavItem(pathname);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Pular para o conteúdo
      </a>

      <aside
        className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex"
        aria-label="Navegação principal"
      >
        <div className="flex h-14 items-center px-5">
          <span className="text-sm font-semibold tracking-tight">INOVAAPPS</span>
        </div>
        <nav className="flex-1 px-3 py-2">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) => cn(linkBase, isActive && linkActive)}
                >
                  <item.icon className="size-4 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-4 border-b border-border px-4 md:px-6">
          <h1 className="truncate text-base font-semibold">{current?.label ?? 'INOVAAPPS'}</h1>
          <div className="flex items-center gap-3">
            {/* TODO (Etapa 1): nome da organização e do usuário vindos da sessão. */}
            <span className="hidden text-sm text-muted-foreground sm:inline">Organização</span>
            <Button variant="ghost" size="sm" disabled title="Disponível na Etapa 1 (auth)">
              <LogOut aria-hidden="true" />
              Sair
            </Button>
          </div>
        </header>

        <nav className="border-b border-border md:hidden" aria-label="Navegação principal">
          <ul className="flex gap-1 overflow-x-auto px-2 py-1.5">
            {NAV_ITEMS.map((item) => (
              <li key={item.to} className="shrink-0">
                <NavLink
                  to={item.to}
                  className={({ isActive }) => cn(linkBase, 'py-1.5', isActive && linkActive)}
                >
                  <item.icon className="size-4" aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main id="conteudo" className="flex-1 px-4 py-6 md:px-6" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
