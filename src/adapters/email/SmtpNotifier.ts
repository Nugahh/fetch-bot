import nodemailer from "nodemailer";
import type { Offer } from "../../domain/entities/Offer.js";
import type { Notifier } from "../../domain/ports/Notifier.js";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  to: string;
}

/**
 * Sends the new-offers digest over SMTP (Gmail by default).
 *
 * The email is a responsive HTML card list with each offer's picture and info,
 * plus a plain-text fallback. Only the {@link Notifier} interface is exposed to
 * the core, so this can be swapped for Telegram/Slack/etc. without any change
 * upstream.
 */
export class SmtpNotifier implements Notifier {
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly config: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
    });
  }

  async notify(offers: Offer[], sourceName: string): Promise<void> {
    const subject =
      offers.length === 1
        ? `🏠 1 nouvelle offre de logement (${sourceName})`
        : `🏠 ${offers.length} nouvelles offres de logement (${sourceName})`;

    await this.transporter.sendMail({
      from: this.config.from,
      to: this.config.to,
      subject,
      text: renderText(offers, sourceName),
      html: renderHtml(offers, sourceName),
    });
  }
}

function renderText(offers: Offer[], sourceName: string): string {
  const lines = offers.map((o, i) => {
    const parts = [
      `${i + 1}. ${o.price}${o.priceExcludingCharges ? ` (${o.priceExcludingCharges})` : ""}`,
      [o.surface, o.typology].filter(Boolean).join(" | "),
      o.location,
      o.reserved ? "⚠️ Réservé" : undefined,
      o.detailUrl,
    ].filter(Boolean);
    return parts.join("\n   ");
  });
  return `${offers.length} nouvelle(s) offre(s) sur ${sourceName} :\n\n${lines.join("\n\n")}\n`;
}

function renderHtml(offers: Offer[], sourceName: string): string {
  const cards = offers.map(renderCard).join("\n");
  return `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px;">
    <h1 style="font-size:20px;color:#1a1a2e;margin:0 0 4px;">🏠 ${offers.length} nouvelle${offers.length > 1 ? "s" : ""} offre${offers.length > 1 ? "s" : ""}</h1>
    <p style="font-size:13px;color:#6b7280;margin:0 0 20px;">Détectée${offers.length > 1 ? "s" : ""} sur ${escapeHtml(sourceName)}</p>
    ${cards}
    <p style="font-size:12px;color:#9ca3af;text-align:center;margin:24px 0 0;">Envoyé automatiquement par fetch-bot.</p>
  </div>
</body>
</html>`;
}

function renderCard(o: Offer): string {
  const img = o.imageUrl
    ? `<img src="${escapeAttr(o.imageUrl)}" alt="Photo du logement" style="width:100%;max-height:220px;object-fit:cover;display:block;background:#e5e7eb;">`
    : `<div style="width:100%;height:120px;background:#e5e7eb;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:13px;">Pas de photo</div>`;

  const meta = [o.surface, o.typology]
    .filter((v): v is string => Boolean(v))
    .map(escapeHtml)
    .join(" &nbsp;|&nbsp; ");
  const reserved = o.reserved
    ? `<span style="display:inline-block;background:#fee2e2;color:#b91c1c;font-size:11px;font-weight:600;padding:2px 8px;border-radius:99px;margin-left:6px;">Réservé</span>`
    : "";
  const hc = o.priceExcludingCharges
    ? `<span style="font-size:13px;color:#6b7280;font-weight:400;">&nbsp;(${escapeHtml(o.priceExcludingCharges)})</span>`
    : "";
  const link = o.detailUrl
    ? `<a href="${escapeAttr(o.detailUrl)}" style="display:inline-block;margin-top:12px;background:#2563eb;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:8px 16px;border-radius:8px;">Voir l'offre →</a>`
    : "";

  return `<div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);margin-bottom:16px;">
    ${img}
    <div style="padding:16px;">
      <div style="font-size:20px;font-weight:700;color:#111827;">${escapeHtml(o.price)}${hc}${reserved}</div>
      ${meta ? `<div style="font-size:14px;color:#374151;margin-top:6px;">${meta}</div>` : ""}
      ${o.location ? `<div style="font-size:14px;color:#6b7280;margin-top:4px;">📍 ${escapeHtml(o.location)}</div>` : ""}
      ${link}
    </div>
  </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
