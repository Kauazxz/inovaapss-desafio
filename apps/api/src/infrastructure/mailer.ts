/**
 * Envio de e-mail do resumo de alertas.
 *
 * O provedor é injetável. Hoje há um: Resend, ligado quando RESEND_API_KEY existe. Sem a chave,
 * o serviço NÃO falha nem finge que enviou: devolve `sent: false` com o motivo e o HTML pronto,
 * para a tela mostrar a prévia e a pessoa decidir configurar o envio.
 *
 * Notificação por push (navegador/celular) usa o mesmo resumo e entra depois; por isso o
 * `AlertDigest` é montado no serviço de alertas, e não aqui.
 */
import type { AlertDigest } from '@inovaapss/shared';

export interface SendResult {
  sent: boolean;
  /** Por que não enviou, quando `sent` é false. */
  reason?: string;
  to: string;
  subject: string;
  /** O corpo que foi (ou seria) enviado. */
  html: string;
  text: string;
  providerId?: string;
}

export interface Mailer {
  sendDigest(to: string, digest: AlertDigest): Promise<SendResult>;
}

const money = (valor: number, moeda: string): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda, maximumFractionDigits: 0 })
    .format(valor)
    .replace(/\u00a0/g, ' ');

const CLASSES: Record<string, string> = {
  NORMAL: 'Normal',
  ATTENTION: 'Atenção',
  RISK: 'Risco',
  CRITICAL: 'Crítico',
};

function assunto(digest: AlertDigest): string {
  if (digest.criticalCount > 0) {
    return `${digest.criticalCount} cliente${digest.criticalCount > 1 ? 's' : ''} em situação crítica — ${digest.organizationName}`;
  }
  return `${digest.totalOpen} alerta${digest.totalOpen === 1 ? '' : 's'} para revisar — ${digest.organizationName}`;
}

/** Texto puro, para clientes de e-mail que não mostram HTML. */
export function renderDigestText(digest: AlertDigest): string {
  const linhas: string[] = [];
  linhas.push(assunto(digest));
  linhas.push('');
  linhas.push(
    `${digest.totalOpen} alerta(s) aberto(s), ${digest.criticalCount} crítico(s). ${money(digest.mrrAtRisk, digest.currency)} por mês em jogo.`,
  );
  linhas.push('');
  for (const [i, h] of digest.highlights.entries()) {
    linhas.push(
      `${i + 1}. ${h.clientName} — saúde ${h.healthScore ?? '—'}/100 (${CLASSES[h.healthClass ?? ''] ?? '—'}), ${money(h.mrr, digest.currency)}/mês`,
    );
    linhas.push(`   Por quê: ${h.reason}`);
    if (h.action) linhas.push(`   O que fazer: ${h.action}`);
    linhas.push(`   Abrir: ${h.clientUrl}`);
    linhas.push('');
  }
  linhas.push(`Ver a carteira inteira: ${digest.dashboardUrl}`);
  return linhas.join('\n');
}

/** HTML simples e legível em qualquer cliente de e-mail (tabela, sem CSS externo). */
export function renderDigestHtml(digest: AlertDigest): string {
  const escapar = (t: string): string =>
    t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const cards = digest.highlights
    .map(
      (h, i) => `
      <tr>
        <td style="padding:16px 0;border-bottom:1px solid #e7e5e1;">
          <div style="font-size:15px;font-weight:600;color:#1c1b19;">
            ${i + 1}. ${escapar(h.clientName)}
            <span style="font-weight:400;color:#6b6862;">
              &nbsp;saúde ${h.healthScore ?? '—'}/100 · ${CLASSES[h.healthClass ?? ''] ?? '—'} · ${escapar(money(h.mrr, digest.currency))}/mês
            </span>
          </div>
          <div style="font-size:14px;color:#3d3b37;margin-top:6px;">${escapar(h.reason)}</div>
          ${h.action ? `<div style="font-size:14px;color:#3d3b37;margin-top:4px;"><strong>O que fazer:</strong> ${escapar(h.action)}</div>` : ''}
          <div style="margin-top:8px;"><a href="${h.clientUrl}" style="font-size:14px;color:#1f6feb;">Abrir a análise deste cliente</a></div>
        </td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="pt-BR"><body style="margin:0;background:#faf9f7;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf9f7;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e7e5e1;border-radius:12px;padding:28px;">
        <tr><td>
          <div style="font-size:12px;letter-spacing:.08em;color:#6b6862;text-transform:uppercase;">INOVAAPPS · ${escapar(digest.organizationName)}</div>
          <h1 style="font-size:20px;line-height:1.35;color:#1c1b19;margin:10px 0 6px;">${escapar(assunto(digest))}</h1>
          <p style="font-size:14px;color:#3d3b37;margin:0 0 4px;">
            ${digest.totalOpen} alerta${digest.totalOpen === 1 ? '' : 's'} aberto${digest.totalOpen === 1 ? '' : 's'},
            ${digest.criticalCount} crítico${digest.criticalCount === 1 ? '' : 's'}.
            <strong>${escapar(money(digest.mrrAtRisk, digest.currency))} por mês</strong> em jogo.
          </p>
          <p style="font-size:13px;color:#6b6862;margin:0 0 8px;">Período de referência: ${escapar(digest.periodEnd)}</p>
        </td></tr>
        ${cards}
        <tr><td style="padding-top:20px;">
          <a href="${digest.dashboardUrl}" style="display:inline-block;background:#1c1b19;color:#ffffff;text-decoration:none;font-size:14px;padding:10px 18px;border-radius:8px;">Ver a carteira no painel</a>
        </td></tr>
        <tr><td style="padding-top:18px;">
          <p style="font-size:12px;color:#6b6862;margin:0;">
            Os alertas vêm de gatilhos críticos configurados nas métricas. Peso e gatilho são coisas
            diferentes: o peso entra no cálculo da saúde, o gatilho pede ação imediata.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export interface ResendOptions {
  apiKey?: string | undefined;
  /** Remetente verificado no provedor. O padrão só funciona em teste. */
  from?: string | undefined;
}

export function createMailer(options: ResendOptions = {}): Mailer {
  const apiKey = options.apiKey?.trim();
  const from = options.from?.trim() || 'INOVAAPPS <onboarding@resend.dev>';

  return {
    async sendDigest(to, digest) {
      const subject = assunto(digest);
      const html = renderDigestHtml(digest);
      const text = renderDigestText(digest);

      if (!apiKey) {
        return {
          sent: false,
          reason:
            'Envio de e-mail não configurado: defina RESEND_API_KEY (e EMAIL_FROM com um remetente verificado) para os alertas saírem por e-mail. Abaixo, a prévia exata da mensagem.',
          to,
          subject,
          html,
          text,
        };
      }

      const resposta = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, html, text }),
      });

      if (!resposta.ok) {
        const corpo = await resposta.text();
        return {
          sent: false,
          reason: `O provedor recusou o envio (HTTP ${resposta.status}): ${corpo.slice(0, 200)}`,
          to,
          subject,
          html,
          text,
        };
      }
      const dados = (await resposta.json()) as { id?: string };
      return { sent: true, to, subject, html, text, ...(dados.id ? { providerId: dados.id } : {}) };
    },
  };
}
