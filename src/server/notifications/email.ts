import nodemailer, { type Transporter } from "nodemailer";
import { createTranslator } from "next-intl";
import type { DbClient } from "@/server/db/client";
import { forOrg } from "@/server/db/tenant";
import en from "@/i18n/messages/en.json";
import ja from "@/i18n/messages/ja.json";
import ko from "@/i18n/messages/ko.json";
import type { EscalationEvent, Notifier } from "./index";

const MESSAGES = { ko, ja, en } as const;
type MailLocale = keyof typeof MESSAGES;

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Emails every staff member of the organization when a conversation is
 * escalated, in each recipient's dashboard locale.
 */
export class EmailNotifier implements Notifier {
  /** Exposed for tests (e.g. a JSON transport). */
  readonly transport: Transporter;

  constructor(
    private readonly client: DbClient,
    private readonly options: {
      server: string | Record<string, unknown>;
      from: string;
      appUrl: string;
    },
  ) {
    this.transport =
      typeof options.server === "string"
        ? nodemailer.createTransport(options.server, {
            connectionTimeout: 5_000,
            greetingTimeout: 5_000,
            socketTimeout: 10_000,
          } as never)
        : nodemailer.createTransport(options.server as never);
  }

  async escalationCreated(event: EscalationEvent) {
    const users = await forOrg(event.organizationId, this.client).user.findMany({
      select: { email: true, locale: true },
    });
    await Promise.all(
      users.map(async (user) => {
        const locale: MailLocale =
          user.locale === "ja" || user.locale === "en" ? user.locale : "ko";
        const t = createTranslator({ locale, messages: MESSAGES[locale] });
        const reason = t(`enums.escalationReason.${event.reason}`);
        const subject =
          event.reason === "EMERGENCY"
            ? t("email.emergencySubject", { property: event.propertyName })
            : t("email.subject", { property: event.propertyName, reason });
        const link = `${this.options.appUrl}/${locale}/inbox/${event.conversationId}`;
        const lines = [
          t("email.intro", { property: event.propertyName }),
          "",
          `${t("email.reason")}: ${reason}`,
          `${t("email.summary")}: ${event.summary}`,
          ...(event.question ? [`${t("email.question")}: ${event.question}`] : []),
          "",
          `${t("email.open")}: ${link}`,
          "",
          t("email.footer"),
        ];
        const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.6">
<p>${escapeHtml(t("email.intro", { property: event.propertyName }))}</p>
<p><b>${escapeHtml(t("email.reason"))}:</b> ${escapeHtml(reason)}<br>
<b>${escapeHtml(t("email.summary"))}:</b> ${escapeHtml(event.summary)}${
          event.question
            ? `<br><b>${escapeHtml(t("email.question"))}:</b> ${escapeHtml(event.question)}`
            : ""
        }</p>
<p><a href="${escapeHtml(link)}">${escapeHtml(t("email.open"))}</a></p>
<p style="color:#888;font-size:12px">${escapeHtml(t("email.footer"))}</p></div>`;
        await this.transport.sendMail({
          from: this.options.from,
          to: user.email,
          subject,
          text: lines.join("\n"),
          html,
        });
      }),
    );
  }
}
