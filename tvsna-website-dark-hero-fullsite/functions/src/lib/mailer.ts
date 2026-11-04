import * as nodemailer from "nodemailer";
import * as logger from "firebase-functions/logger";

/**
 * Transactional email.
 *
 * Currently sends through a consumer Gmail account, which is why the signup
 * flow has always had to tell people to check their spam folder: mail from
 * vokkaligasangam@gmail.com has no DKIM alignment with vmsna.org, so it is
 * treated as unauthenticated on the receiving side.
 *
 * The fix is a domain sender with SPF, DKIM and DMARC on vmsna.org. That is
 * DNS work, not code — see docs/RUNBOOK-email.md. This module exists so the
 * switch is one file rather than nine call sites.
 */

export const ADMIN_INBOX = process.env.ADMIN_INBOX || "vokkaligasangam@gmail.com";
export const FROM = process.env.MAIL_FROM || "VMSNA <vokkaligasangam@gmail.com>";
export const SITE_ORIGIN = process.env.SITE_ORIGIN || "https://vmsna.org";

let cached: nodemailer.Transporter | null = null;

export function transporter(): nodemailer.Transporter {
  if (cached) return cached;
  cached = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER || "vokkaligasangam@gmail.com",
      pass: process.env.GMAIL_APP_PASSWORD || "",
    },
  });
  return cached;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Shared wrapper so every message looks like it came from the same
 * organisation. Plain, warm, and readable in a text-only client.
 */
export function layout(title: string, bodyHtml: string, cta?: { href: string; label: string }): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f1710">
    <h1 style="font-size:20px;color:#1f1710;margin:0 0 16px">${escapeHtml(title)}</h1>
    ${bodyHtml}
    ${
      cta
        ? `<p style="margin:24px 0"><a href="${cta.href}" style="display:inline-block;background:#b4532a;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none">${escapeHtml(cta.label)}</a></p>`
        : ""
    }
    <hr style="border:0;border-top:1px solid #e3d9c8;margin:28px 0">
    <p style="color:#6b5d4e;font-size:13px;margin:0">
      Vokkaliga Mahajana Sangam North America<br>
      <a href="${SITE_ORIGIN}" style="color:#b4532a">vmsna.org</a>
    </p>
  </div>`;
}

/** Rows of label/value for a details block. */
export function detailTable(rows: [string, unknown][]): string {
  return `<table style="border-collapse:collapse;margin:16px 0;width:100%">${rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#6b5d4e;font-size:14px;vertical-align:top;white-space:nowrap">${escapeHtml(
          label,
        )}</td><td style="padding:6px 0;font-size:14px">${escapeHtml(value || "—")}</td></tr>`,
    )
    .join("")}</table>`;
}

export async function send(options: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<boolean> {
  try {
    await transporter().sendMail({ from: FROM, ...options });
    return true;
  } catch (error) {
    // Never rethrow into a Firestore trigger: a failed notification must not
    // roll back or retry the write that caused it.
    logger.error(`Email to ${options.to} failed: ${options.subject}`, error);
    return false;
  }
}
