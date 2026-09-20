import {
  Bell,
  Database,
  FileText,
  Gauge,
  LayoutDashboard,
  type LucideIcon,
  Target,
  Upload,
  Users,
} from 'lucide-react';

/** Uma tela alcançável pela navegação superior (§38). */
export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Uma linha explicando o que a tela responde — aparece nos submenus. */
  hint?: string;
}

/**
 * Entrada da barra: ou um link direto, ou um grupo que abre um submenu.
 * Agrupar existe para a barra caber numa cápsula só: cinco entradas no lugar de nove links.
 */
export type NavEntry =
  | ({ kind: 'link' } & NavItem)
  | { kind: 'group'; id: string; label: string; icon: LucideIcon; items: readonly NavItem[] };

/** Ordem = ordem de uso no dia a dia: primeiro o que responde "com quem falar". */
export const NAV_ENTRIES: readonly NavEntry[] = [
  {
    kind: 'link',
    to: '/dashboard',
    label: 'Painel',
    icon: LayoutDashboard,
    hint: 'Com quem falar hoje.',
  },
  {
    kind: 'link',
    to: '/clients',
    label: 'Clientes',
    icon: Users,
    hint: 'A carteira da organização.',
  },
  {
    kind: 'link',
    to: '/alerts',
    label: 'Alertas',
    icon: Bell,
    hint: 'O que mudou e merece atenção.',
  },
  {
    kind: 'group',
    id: 'metricas',
    label: 'Métricas',
    icon: Gauge,
    items: [
      {
        to: '/metrics',
        label: 'Métricas',
        icon: Gauge,
        // A tela de modelos virou a faixa do alto de /metrics: uma entrada só na barra.
        hint: 'O que o sistema mede, com peso e ordem.',
      },
      {
        to: '/calibration',
        label: 'Calibração',
        icon: Target,
        hint: 'Se o modelo está acertando.',
      },
    ],
  },
  {
    kind: 'group',
    id: 'dados',
    label: 'Dados',
    icon: Database,
    items: [
      {
        to: '/import',
        label: 'Importar dados',
        icon: Upload,
        hint: 'Planilha ou arquivo virando métrica.',
      },
      {
        to: '/documents',
        label: 'Documentos',
        icon: FileText,
        hint: 'Contratos e arquivos da organização.',
      },
    ],
  },
];

/** Todas as telas da navegação, já achatadas (usado por testes e pela busca de título). */
export const NAV_ITEMS: readonly NavItem[] = NAV_ENTRIES.flatMap((entry) =>
  entry.kind === 'link' ? [{ to: entry.to, label: entry.label, icon: entry.icon }] : entry.items,
);

/** Uma entrada de grupo está ativa quando a rota atual é de uma das suas telas. */
export function isGroupActive(items: readonly NavItem[], pathname: string): boolean {
  return items.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
}
