import { LogOut } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/use-auth';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from '@/routes/nav';

const linkBase =
  'flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50';
const linkActive = 'bg-accent text-accent-foreground';

/** Layout privado com navegação superior fixa durante a rolagem. */
export function PrivateLayout() {
  const { me, user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#conteudo"
        className="sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Pular para o conteúdo
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-background/95 shadow-xs backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="flex h-14 items-center justify-between gap-4 px-4 md:px-6">
          <NavLink
            to="/dashboard"
            className="shrink-0 rounded-md text-sm font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label="INOVAAPPS — ir para a dashboard"
          >
            INOVAAPPS
          </NavLink>

          <div className="flex min-w-0 items-center gap-3">
            <div className="hidden min-w-0 text-right sm:block">
              <p className="max-w-56 truncate text-sm font-medium" data-testid="organization-name">
                {me?.organization?.name ?? '—'}
              </p>
              <p className="max-w-56 truncate text-xs text-muted-foreground">
                {user?.email ?? ''}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void signOut()}
              title="Encerrar a sessão"
            >
              <LogOut aria-hidden="true" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>

        <nav className="border-t border-border/70" aria-label="Navegação principal">
          <ul className="flex gap-1 overflow-x-auto px-2 py-1 md:px-4 2xl:justify-center">
            {NAV_ITEMS.map((item) => (
              <li key={item.to} className="shrink-0">
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
      </header>

      <main id="conteudo" className="px-4 py-6 md:px-6" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
