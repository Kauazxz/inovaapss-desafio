import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';

import type { LucideIcon } from 'lucide-react';

interface PlaceholderPageProps {
  title: string;
  description: string;
  icon: LucideIcon;
  /** O que a tela vai mostrar quando a etapa correspondente entregar. */
  emptyTitle: string;
  emptyDescription: string;
}

/** Tela ainda sem feature: cabeçalho + um estado vazio honesto sobre o que falta. */
export function PlaceholderPage({
  title,
  description,
  icon,
  emptyTitle,
  emptyDescription,
}: PlaceholderPageProps) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <EmptyState icon={icon} title={emptyTitle} description={emptyDescription} />
    </>
  );
}
