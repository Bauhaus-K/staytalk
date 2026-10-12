import nodemailer, { type Transporter } from "nodemailer";
import { createTranslator } from "next-intl";
import type { DbClient } from "@/server/db/client";
import { forOrg } from "@/server/db/tenant";
import en from "@/i18n/messages/en.json";
import ja from "@/i18n/messages/ja.json";
import ko from "@/i18n/messages/ko.json";
import type { BookingRequestedEvent, EscalationEvent, Notifier } from "./index";

const MESSAGES = { ko, ja, en } as const;
type MailLocale = keyof typeof MESSAGES;
/** Loosely typed translator: keys are built dynamically (e.g. per enum value). */
type Translate = (key: string, values?: Record<string, string | number>) => string;

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
    await this.sendToStaff(event.organizationId, (t, locale) => {
      const reason = t(`enums.escalationReason.${event.reason}`);
      return {
        subject:
          event.reason === "EMERGENCY"
            ? t("email.emergencySubject", { property: event.propertyName })
            : t("email.subject", { property: event.propertyName, reason }),
        intro: t("email.intro", { property: event.propertyName }),
        fields: [
          [t("email.reason"), reason],
          [t("email.summary"), event.summary],
          ...(event.question
            ? ([[t("email.question"), event.question]] as [string, string][])
            : []),
        ],
        link: [t("email.open"), `${this.options.appUrl}/${locale}/inbox/${event.conversationId}`],
      };
    });
  }

  async bookingRequested(event: BookingRequestedEvent) {
    await this.sendToStaff(event.organizationId, (t, locale) => ({
      subject: t("email.bookingSubject", {
        property: event.propertyName,
        reference: event.reference,
      }),
      intro: t("email.bookingIntro", { property: event.propertyName }),
      fields: [
        [t("email.room"), event.roomName],
        [t("email.dates"), `${event.checkIn} ~ ${event.checkOut}`],
        [t("email.guests"), String(event.guests)],
      ],
      link: [t("email.openBookings"), `${this.options.appUrl}/${locale}/bookings?status=PENDING`],
    }));
  }

  /** Sends one mail per staff member, rendered in that member's locale. */
  private async sendToStaff(
    organizationId: string,
    build: (
      t: Translate,
      locale: MailLocale,
    ) => { subject: string; intro: string; fields: [string, string][]; link: [string, string] },
  ) {
    const users = await forOrg(organizationId, this.client).user.findMany({
      select: { email: true, locale: true },
    });
    await Promise.all(
      users.map(async (user) => {
        const locale: MailLocale =
          user.locale === "ja" || user.locale === "en" ? user.locale : "ko";
        const t = createTranslator({ locale, messages: MESSAGES[locale] }) as unknown as Translate;
        const mail = build(t, locale);
        const [linkLabel, url] = mail.link;
        const text = [
          mail.intro,
          "",
          ...mail.fields.map(([k, v]) => `${k}: ${v}`),
          "",
          `${linkLabel}: ${url}`,
          "",
          t("email.footer"),
        ].join("\n");
        const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.6">
<p>${escapeHtml(mail.intro)}</p>
<p>${mail.fields.map(([k, v]) => `<b>${escapeHtml(k)}:</b> ${escapeHtml(v)}`).join("<br>")}</p>
<p><a href="${escapeHtml(url)}">${escapeHtml(linkLabel)}</a></p>
<p style="color:#888;font-size:12px">${escapeHtml(t("email.footer"))}</p></div>`;
        await this.transport.sendMail({
          from: this.options.from,
          to: user.email,
          subject: mail.subject,
          text,
          html,
        });
      }),
    );
  }
}
