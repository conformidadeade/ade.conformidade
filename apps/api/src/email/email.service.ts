import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Envio de e-mail transacional via Resend (adendo "Confirmação de e-mail
 * e recuperação de senha", 09/09/2026) — encapsulado neste serviço para
 * isolar a integração e facilitar troca futura de provedor, se necessário.
 * Usa `fetch` nativo (Node 22+), sem SDK adicional.
 *
 * Sem `RESEND_API_KEY` configurada (ex.: dev local sem conta Resend
 * criada ainda), o e-mail não é enviado de verdade — só logado em nível
 * `warn`, com o link completo, para dar para testar o fluxo manualmente
 * sem precisar de conta no provedor. Isso é uma escolha de conveniência
 * de desenvolvimento, sinalizada aqui — nunca o comportamento em
 * produção, onde a variável é obrigatória (ver `docs/DEPLOY.md`).
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendInviteEmail(to: string, name: string, link: string): Promise<void> {
    await this.send({
      to,
      subject: "Confirme seu e-mail e defina sua senha — ADE",
      html: `
        <p>Olá, ${escapeHtml(name)}.</p>
        <p>Uma conta foi criada para você no ADE (Administração de Dados e Estratégias).
        Confirme seu e-mail e defina sua senha para começar a usar o sistema:</p>
        <p><a href="${link}">${link}</a></p>
        <p>Este link expira em 48 horas. Se você não esperava este e-mail, pode ignorá-lo.</p>
      `,
    });
  }

  async sendPasswordResetEmail(to: string, name: string, link: string): Promise<void> {
    await this.send({
      to,
      subject: "Redefinição de senha — ADE",
      html: `
        <p>Olá, ${escapeHtml(name)}.</p>
        <p>Recebemos um pedido para redefinir a senha da sua conta no ADE. Se foi você, clique no link abaixo:</p>
        <p><a href="${link}">${link}</a></p>
        <p>Este link expira em 1 hora. Se você não pediu essa redefinição, pode ignorar este e-mail —
        sua senha atual continua funcionando normalmente.</p>
      `,
    });
  }

  private async send(input: { to: string; subject: string; html: string }): Promise<void> {
    const apiKey = this.config.get<string>("RESEND_API_KEY");
    const from = this.config.get<string>("EMAIL_FROM");

    if (!apiKey || !from) {
      this.logger.warn(
        `RESEND_API_KEY/EMAIL_FROM não configurados — e-mail NÃO enviado de verdade. ` +
          `Destinatário: ${input.to} | Assunto: ${input.subject}\n${input.html}`,
      );
      return;
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: input.to, subject: input.subject, html: input.html }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      // Nunca deixa o fluxo (criação de usuário, esqueci-senha) quebrar
      // por completo por causa de uma falha no envio — quem chama decide
      // como reagir (ex.: UsersService loga e mantém o "Reenviar convite"
      // como caminho alternativo, já que a conta foi criada normalmente).
      this.logger.error(`Falha ao enviar e-mail via Resend (status ${response.status}): ${body}`);
      throw new Error(`Falha ao enviar e-mail (Resend respondeu ${response.status}).`);
    }
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
