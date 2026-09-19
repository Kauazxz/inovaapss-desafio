import { Link } from 'react-router';

import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center text-foreground">
      <p className="text-sm font-medium text-muted-foreground">Erro 404</p>
      <h1 className="text-2xl font-semibold">Essa página não existe</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        O endereço pode ter mudado ou o link estava errado.
      </p>
      <Button asChild>
        <Link to="/dashboard">Ir para o dashboard</Link>
      </Button>
    </main>
  );
}
