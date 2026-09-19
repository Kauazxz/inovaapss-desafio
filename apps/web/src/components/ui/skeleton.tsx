// Componente do shadcn/ui (estilo radix-nova, registro de 19/09/2026).
// Ajuste local: `cn` vem de @/lib/utils (clsx + tailwind-merge) em vez do pacote "cn".

import * as React from 'react';

import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}

export { Skeleton };
