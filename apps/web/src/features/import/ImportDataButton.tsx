import { Upload } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';

interface ImportDataButtonProps {
  /** `outline` no topo de uma tela cheia; `default` num estado vazio, onde é a única ação. */
  variant?: 'default' | 'outline';
}

/**
 * Atalho para /import. Fica no topo do dashboard e no estado vazio dele, que é exatamente onde
 * a pergunta aparece: "não tem nada aqui — como coloco meus dados?".
 */
export function ImportDataButton({ variant = 'outline' }: ImportDataButtonProps) {
  return (
    <Button asChild variant={variant}>
      <Link to="/import">
        <Upload aria-hidden="true" />
        Importar dados
      </Link>
    </Button>
  );
}
