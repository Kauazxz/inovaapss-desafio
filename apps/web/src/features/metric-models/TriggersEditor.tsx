/**
 * Editor dos gatilhos críticos de um item (§22, §27). As linhas e a conversão para a lista crua
 * ficam em `triggers.ts`; aqui só fica a interface.
 */
import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { SelectField, TextField, TextareaField } from './fields';
import { emptyTriggerRow, type TriggerRow } from './triggers';

const KIND_OPTIONS = [
  { value: 'THRESHOLD' as const, label: 'Limite (valor ou health)' },
  { value: 'STREAK' as const, label: 'Sequência de períodos' },
  { value: 'JSON_LOGIC' as const, label: 'Regra JSON Logic segura' },
];

const SEVERITY_OPTIONS = [
  { value: 'INFO' as const, label: 'Informativo' },
  { value: 'WARNING' as const, label: 'Atenção' },
  { value: 'CRITICAL' as const, label: 'Crítico' },
];

const OPERATOR_OPTIONS = (['>', '>=', '<', '<=', '==', '!='] as const).map((value) => ({
  value,
  label: value,
}));

export function TriggersEditor({
  rows,
  onChange,
  disabled,
}: {
  rows: TriggerRow[];
  onChange: (rows: TriggerRow[]) => void;
  disabled: boolean;
}) {
  const patch = (index: number, changes: Partial<TriggerRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...changes } : row)));

  return (
    <div className="space-y-4">
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum gatilho. Sem gatilho, a métrica continua contribuindo para o score pelo peso, mas
          não gera ação imediata.
        </p>
      ) : null}

      {rows.map((row, index) => (
        <div key={index} className="space-y-3 rounded-lg border border-border p-3">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">Gatilho {index + 1}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              aria-label={`Remover o gatilho ${index + 1}`}
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Identificador"
              disabled={disabled}
              value={row.id}
              onChange={(value) => patch(index, { id: value })}
            />
            <TextField
              label="Nome"
              disabled={disabled}
              value={row.name}
              onChange={(value) => patch(index, { name: value })}
            />
            <SelectField
              label="Tipo"
              disabled={disabled}
              value={row.kind}
              onChange={(kind) => patch(index, { kind })}
              options={KIND_OPTIONS}
            />
            <SelectField
              label="Severidade"
              disabled={disabled}
              value={row.severity}
              onChange={(severity) => patch(index, { severity })}
              options={SEVERITY_OPTIONS}
            />
          </div>

          {row.kind === 'THRESHOLD' ? (
            <div className="grid grid-cols-3 gap-3">
              <TextField
                label="Campo"
                disabled={disabled}
                value={row.field}
                onChange={(value) => patch(index, { field: value })}
                hint="value, health ou extra.<campo>"
              />
              <SelectField
                label="Operador"
                disabled={disabled}
                value={row.operator}
                onChange={(operator) => patch(index, { operator })}
                options={OPERATOR_OPTIONS}
              />
              <TextField
                label="Limite"
                type="number"
                disabled={disabled}
                value={row.threshold}
                onChange={(value) => patch(index, { threshold: value })}
              />
            </div>
          ) : null}

          {row.kind === 'STREAK' ? (
            <div className="grid grid-cols-3 gap-3">
              <SelectField
                label="Operador"
                disabled={disabled}
                value={row.operator}
                onChange={(operator) => patch(index, { operator })}
                options={OPERATOR_OPTIONS}
              />
              <TextField
                label="Limite"
                type="number"
                disabled={disabled}
                value={row.threshold}
                onChange={(value) => patch(index, { threshold: value })}
              />
              <TextField
                label="Períodos seguidos"
                type="number"
                disabled={disabled}
                value={row.consecutivePeriods}
                onChange={(value) => patch(index, { consecutivePeriods: value })}
              />
            </div>
          ) : null}

          {row.kind === 'JSON_LOGIC' ? (
            <TextareaField
              label="Regra em JSON"
              disabled={disabled}
              value={row.rule}
              onChange={(value) => patch(index, { rule: value })}
            />
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Piso de prioridade"
              type="number"
              disabled={disabled}
              value={row.priorityFloor}
              onChange={(value) => patch(index, { priorityFloor: value })}
              hint="Em branco: o gatilho não força prioridade."
            />
            <TextField
              label="Mensagem"
              disabled={disabled}
              value={row.message}
              onChange={(value) => patch(index, { message: value })}
            />
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => onChange([...rows, emptyTriggerRow(rows.length)])}
      >
        <Plus aria-hidden="true" />
        Adicionar gatilho
      </Button>
    </div>
  );
}
