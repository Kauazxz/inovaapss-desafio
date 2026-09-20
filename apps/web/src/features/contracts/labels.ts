/** Rótulos em português dos contratos. Datas e dinheiro reaproveitam os formatadores de clientes. */
import type { ContractStatus } from '@inovaapss/validation';

export { formatDate, formatMoney } from '@/features/clients/labels';

export const CONTRACT_STATUS_LABELS: Readonly<Record<ContractStatus, string>> = {
  active: 'Ativo',
  ended: 'Encerrado',
  suspended: 'Suspenso',
};

/** Hoje como data civil ISO (`AAAA-MM-DD`), no fuso do navegador. */
export function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
