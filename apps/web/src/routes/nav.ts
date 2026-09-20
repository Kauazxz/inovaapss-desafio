import {
  Bell,
  Bot,
  FileText,
  Gauge,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  SlidersHorizontal,
  Target,
  Upload,
  Users,
} from 'lucide-react';

/** Item da navegação superior do layout privado (§38). */
export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

/** Ordem = ordem de uso no dia a dia: primeiro o que responde "com quem falar". */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/clients', label: 'Clientes', icon: Users },
  { to: '/alerts', label: 'Alertas', icon: Bell },
  { to: '/assistant', label: 'Agente IA', icon: Bot },
  { to: '/metrics', label: 'Métricas', icon: Gauge },
  { to: '/metric-models', label: 'Modelos de métricas', icon: SlidersHorizontal },
  { to: '/import', label: 'Importar dados', icon: Upload },
  { to: '/documents', label: 'Documentos', icon: FileText },
  { to: '/calibration', label: 'Calibração', icon: Target },
  { to: '/settings', label: 'Configurações', icon: Settings },
];
