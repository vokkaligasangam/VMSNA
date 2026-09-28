/**
 * Notifications for the two unauthenticated public forms.
 *
 * Neither had a reader. helpRequests — education, medical and employment
 * hardship requests from community families — was written by help.html and
 * then read by nothing, anywhere in the codebase. The only way to discover one
 * was to open the Firebase console. The same was true of contactMessages.
 *
 * These triggers put them in front of somebody, and acknowledge the sender so
 * they know the message arrived.
 */
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { ADMIN_INBOX, SITE_ORIGIN, detailTable, layout, send } from "./lib/mailer.js";

const SECRETS = ["GMAIL_APP_PASSWORD"];

export const notifyHelpRequest = onDocumentCreated(
  { document: "helpRequests/{id}", region: "us-central1", secrets: SECRETS },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const type = String(data.requestType ?? "General");
    const urgent = String(data.urgency ?? "").toLowerCase() === "immediate";

    // Everything the form collected, minus the bookkeeping fields.
    const rows = Object.entries(data)
      .filter(([k]) => !["submittedAt", "status", "requestType"].includes(k))
      .map(([k, v]) => [k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()), v]) as [
      string,
      unknown,
    ][];

    const ok = await send({
      to: ADMIN_INBOX,
      replyTo: typeof data.email === "string" ? data.email : undefined,
      subject: `${urgent ? "[Immediate] " : ""}${type} assistance request — VMSNA`,
      html: layout(
        `${type} assistance request`,
        `<p style="font-size:15px;line-height:1.6">Someone has asked VMSNA for help. Reply to this email to reach them directly.</p>
         ${detailTable(rows)}
         <p style="font-size:13px;color:#6b5d4e">This request is visible only to administrators. It is not shown to other members.</p>`,
        { href: `${SITE_ORIGIN}/admin/welfare/`, label: "Open the welfare inbox" },
      ),
    });

    // Acknowledge the person who asked, so silence is not the first response.
    if (typeof data.email === "string" && data.email.includes("@")) {
      await send({
        to: data.email,
        subject: "We have your request — VMSNA",
        html: layout(
          "We have your request",
          `<p style="font-size:15px;line-height:1.6">Thank you for reaching out. Your ${escapeLower(type)} request has reached the committee that handles it, and someone will be in touch.</p>
           <p style="font-size:15px;line-height:1.6">What you sent us is seen only by the committee members dealing with it. It is not shared with other members and is not published anywhere.</p>
           <p style="font-size:14px;color:#6b5d4e">If your situation is urgent and you have not heard back, reply to this email.</p>`,
        ),
      });
    }

    await event.data?.ref.set(
      { adminNotified: ok, notifiedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
    logger.info(`Help request notification (${type}) sent: ${ok}`);
  },
);

function escapeLower(value: string): string {
  return value.toLowerCase().replace(/[<>&"]/g, "");
}

export const notifyContactMessage = onDocumentCreated(
  { document: "contactMessages/{id}", region: "us-central1", secrets: SECRETS },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const ok = await send({
      to: ADMIN_INBOX,
      replyTo: typeof data.email === "string" ? data.email : undefined,
      subject: `Contact form: ${String(data.subject ?? "no subject").slice(0, 80)}`,
      html: layout(
        "New message from the website",
        detailTable([
          ["From", data.name],
          ["Email", data.email],
          ["Subject", data.subject],
          ["Message", data.message],
        ]),
        { href: `${SITE_ORIGIN}/admin/contact/`, label: "Open the contact inbox" },
      ),
    });

    await event.data?.ref.set(
      { adminNotified: ok, notifiedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
    logger.info(`Contact message notification sent: ${ok}`);
  },
);
