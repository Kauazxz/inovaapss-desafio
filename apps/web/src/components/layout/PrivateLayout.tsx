import { Activity, ChevronDown, LogOut, Menu, Settings } from 'lucide-react';
import { Fragment } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/features/auth/use-auth';
import { cn } from '@/lib/utils';
import { isGroupActive, type NavItem, NAV_ENTRIES } from '@/routes/nav';

/** Uma entrada da cápsula: link direto ou gatilho de grupo. Ativa = pílula na cor de ação. */
const pill =
  'inline-flex h-10 cursor-default items-center gap-1 rounded-full px-4 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50';
const pillActive = 'bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground';

/** Item de submenu: ícone, nome e uma linha dizendo o que a tela responde. */
function MenuLink({ item }: { item: NavItem }) {
  const { pathname } = useLocation();
  const active = pathname === item.to || pathname.startsWith(`${item.to}/`);

  return (
    <DropdownMenuItem asChild>
      <NavLink to={item.to} className={cn(active && 'bg-accent text-accent-foreground')}>
        <item.icon className="mt-0.5 opacity-70" aria-hidden="true" />
        <span className="flex min-w-0 flex-col">
          <span className="font-medium">{item.label}</span>
          {item.hint ? <span className="text-xs text-muted-foreground">{item.hint}</span> : null}
        </span>
      </NavLink>
    </DropdownMenuItem>
  );
}

/**
 * Layout privado: uma cápsula de navegação flutuante que acompanha a rolagem, para trocar de tela
 * de qualquer ponto da página sem voltar ao topo. Nove telas cabem em cinco entradas — "Métricas"
 * e "Dados" abrem submenu; a conta guarda organização, configurações e saída.
 */
export function PrivateLayout() {
  const { me, user, signOut } = useAuth();

  const email = user?.email ?? '';
  const organization = me?.organization?.name ?? '—';
  const initials = (organization === '—' ? email : organization).slice(0, 2).toUpperCase() || '??';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#conteudo"
        className="sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Pular para o conteúdo
      </a>

      <header className="sticky top-0 z-40 bg-linear-to-b from-background via-background/85 to-transparent px-4 pt-3 pb-4 md:px-6">
        <div className="cn-container flex h-16 items-center gap-1 rounded-full bg-card/90 px-2.5 shadow-float ring-1 ring-foreground/5 backdrop-blur-lg">
          <NavLink
            to="/dashboard"
            className="ml-1 flex shrink-0 items-center gap-2 rounded-full py-1 pr-2 pl-1 text-sm font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label="INOVAAPPS — ir para o painel"
          >
            <span
              className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground"
              aria-hidden="true"
            >
              <Activity className="size-4.5" />
            </span>
            <span className="hidden sm:inline">INOVAAPPS</span>
          </NavLink>

          <nav
            className="ml-2 hidden min-w-0 flex-1 items-center gap-0.5 md:flex"
            aria-label="Navegação principal"
          >
            {NAV_ENTRIES.map((entry) =>
              entry.kind === 'link' ? (
                <NavLink
                  key={entry.to}
                  to={entry.to}
                  className={({ isActive }) => cn(pill, isActive && pillActive)}
                >
                  {entry.label}
                </NavLink>
              ) : (
                <NavGroup key={entry.id} label={entry.label} items={entry.items} />
              ),
            )}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1 md:ml-0">
            <DropdownMenu>
              <DropdownMenuTrigger
                className="flex h-10 items-center gap-2 rounded-full px-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                aria-label="Conta e organização"
              >
                <span
                  className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground"
                  aria-hidden="true"
                >
                  {initials}
                </span>
                <span className="hidden max-w-40 truncate text-sm font-medium lg:block">
                  {organization}
                </span>
                <ChevronDown
                  className="mr-1 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                <DropdownMenuLabel className="pb-0">Organização</DropdownMenuLabel>
                <div className="px-2.5 pb-1.5">
                  <p className="truncate text-sm font-medium" data-testid="organization-name">
                    {organization}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <NavLink to="/settings">
                    <Settings className="opacity-70" aria-hidden="true" />
                    Configurações
                  </NavLink>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void signOut()}>
                  <LogOut className="opacity-70" aria-hidden="true" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <MobileMenu />
          </div>
        </div>
      </header>

      <main id="conteudo" className="cn-container px-4 pt-2 pb-16 md:px-6" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}

/** Entrada da barra que abre um submenu (ex.: "Métricas"). */
function NavGroup({ label, items }: { label: string; items: readonly NavItem[] }) {
  const { pathname } = useLocation();
  const active = isGroupActive(items, pathname);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(pill, active && pillActive)}>
        {label}
        <ChevronDown className="size-3.5 opacity-60" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-64">
        {items.map((item) => (
          <MenuLink key={item.to} item={item} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** No celular a cápsula guarda a navegação inteira atrás de um botão só. */
function MobileMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex size-9 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 md:hidden"
        aria-label="Abrir a navegação"
      >
        <Menu className="size-5" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64 md:hidden">
        {NAV_ENTRIES.map((entry) =>
          entry.kind === 'link' ? (
            <MenuLink key={entry.to} item={entry} />
          ) : (
            <Fragment key={entry.id}>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{entry.label}</DropdownMenuLabel>
              {entry.items.map((item) => (
                <MenuLink key={item.to} item={item} />
              ))}
            </Fragment>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
