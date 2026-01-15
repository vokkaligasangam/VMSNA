/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */
import { setGlobalOptions } from "firebase-functions";
import { onCall } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import * as nodemailer from "nodemailer";
import * as admin from "firebase-admin";

// Initialize Firebase Admin
admin.initializeApp();

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

// Configure Gmail SMTP transporter
// Use Firebase environment configuration for credentials
const gmailTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.GMAIL_USER || "vokkaligasangam@gmail.com",
        pass: process.env.GMAIL_APP_PASSWORD || "", // Set via: firebase functions:secrets:set GMAIL_APP_PASSWORD
    },
});

// Send approval email - allows authenticated users to trigger via client
export const sendApprovalEmail = onCall({
    region: "us-central1",
    invoker: "public"
}, async (request) => {
    // Auth check temporarily disabled for testing
    // if (!request.auth) {
    //     throw new Error("Unauthenticated request");
    // }

    const { email, name } = request.data;

    if (!email || !name) {
        throw new Error("Missing email or name");
    }

    const mailOptions = {
        from: "VMSNA <vokkaligasangam@gmail.com>", // Replace with your Gmail
        to: email,
        subject: "🎉 Your VMSNA Membership Has Been Approved!",
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0ea5a4;">Welcome to VMSNA!</h2>
        <p>Dear ${name},</p>
        <p>We are pleased to inform you that your membership application has been <strong>approved</strong>!</p>
        <p>You now have full access to the VMSNA member directory and all member benefits.</p>
        <p><a href="https://vmsna.web.app/dashboard.html" style="display: inline-block; background: #0ea5a4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">Access Your Dashboard</a></p>
        <p>Thank you for joining the Vokkaliga Mahajana Sangam North America community!</p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;">
        <p style="color: #666; font-size: 14px;">
          If you have any questions, please contact us at <a href="mailto:info@vmsna.org">info@vmsna.org</a>
        </p>
      </div>
    `,
    };

    try {
        await gmailTransporter.sendMail(mailOptions);
        logger.info(`Approval email sent to ${email}`);
        return { success: true, message: "Email sent successfully" };
    } catch (error) {
        logger.error("Error sending email:", error);
        throw new Error(`Failed to send email: ${error}`);
    }
});

// Automatically send approval email when status changes to "approved"
export const sendApprovalEmailOnStatusChange = onDocumentUpdated(
    "membershipApplications/{docId}",
    async (event) => {
        const beforeData = event.data?.before.data();
        const afterData = event.data?.after.data();

        // Check if status changed to "approved"
        if (beforeData?.status !== "approved" && afterData?.status === "approved") {
            const { email, name } = afterData;

            if (!email || !name) {
                logger.error("Missing email or name in approved application");
                return;
            }

            const mailOptions = {
                from: "VMSNA <vokkaligasangam@gmail.com>",
                to: email,
                subject: "🎉 Your VMSNA Membership Has Been Approved!",
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #0ea5a4;">Welcome to VMSNA!</h2>
                    <p>Dear ${name},</p>
                    <p>We are pleased to inform you that your membership application has been <strong>approved</strong>!</p>
                    <p>You now have full access to the VMSNA member directory and all member benefits.</p>
                    <p><a href="https://vmsna.web.app/dashboard.html" style="display: inline-block; background: #0ea5a4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">Access Your Dashboard</a></p>
                    <p>Thank you for joining the Vokkaliga Mahajana Sangam North America community!</p>
                    <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;">
                    <p style="color: #666; font-size: 14px;">
                      If you have any questions, please contact us at <a href="mailto:info@vmsna.org">info@vmsna.org</a>
                    </p>
                  </div>
                `,
            };

            try {
                await gmailTransporter.sendMail(mailOptions);
                logger.info(`Approval email sent to ${email} (${name})`);
            } catch (error) {
                logger.error("Error sending approval email:", error);
            }
        }
    }
);

// Send admin notification when new member registers AND verifies email
export const notifyAdminNewApplication = onDocumentCreated(
    "membershipApplications/{docId}",
    async (event) => {
        const data = event.data?.data();

        if (!data || data.status !== "pending") {
            return; // Only notify for new pending applications
        }

        // Skip if already notified
        if (data.adminNotified === true) {
            logger.info(`Admin already notified for ${data.email}, skipping duplicate notification`);
            return;
        }

        const { userId, name, email, phone, city, state, profession } = data;

        // Check if user has verified their email
        try {
            const userRecord = await admin.auth().getUser(userId);

            if (!userRecord.emailVerified) {
                logger.info(`Skipping admin notification for ${email} - email not verified yet`);
                return; // Don't notify admin until email is verified
            }
        } catch (error) {
            logger.error(`Error checking email verification for ${email}:`, error);
            return;
        }

        // Use transaction to prevent duplicate notifications
        const db = admin.firestore();
        const docRef = event.data?.ref;

        if (!docRef) {
            logger.error("Document reference is undefined");
            return;
        }

        try {
            await db.runTransaction(async (transaction) => {
                const doc = await transaction.get(docRef);
                const currentData = doc.data();

                // Double-check within transaction
                if (currentData?.adminNotified === true) {
                    logger.info(`Admin already notified (checked in transaction) for ${email}`);
                    return;
                }

                const adminEmail = "vokkaligasangam@gmail.com";

                const mailOptions = {
                    from: "VMSNA <vokkaligasangam@gmail.com>",
                    to: adminEmail,
                    subject: "🔔 New VMSNA Membership Application",
                    html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #d9a441;">New Membership Application</h2>
          <p>A new member has registered and verified their email.</p>
          
          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 8px 0;"><strong>Name:</strong> ${name || "N/A"}</p>
            <p style="margin: 8px 0;"><strong>Email:</strong> ${email || "N/A"} ✓ Verified</p>
            <p style="margin: 8px 0;"><strong>Phone:</strong> ${phone || "N/A"}</p>
            <p style="margin: 8px 0;"><strong>Location:</strong> ${city || "N/A"}, ${state || "N/A"}</p>
            <p style="margin: 8px 0;"><strong>Profession:</strong> ${profession || "N/A"}</p>
          </div>
          
          <p><a href="https://vmsna.web.app/admin.html" style="display: inline-block; background: #0ea5a4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">Review Application</a></p>
          
          <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;">
          <p style="color: #666; font-size: 14px;">
            This is an automated notification from the VMSNA membership system.
          </p>
        </div>
      `,
                };

                await gmailTransporter.sendMail(mailOptions);
                logger.info(`Admin notification sent for new application: ${name} (${email})`);

                // Mark as notified within transaction
                transaction.update(docRef, { adminNotified: true });
            });
        } catch (error) {
            logger.error("Error sending admin notification:", error);
            // Don't throw - we don't want registration to fail if email fails
        }
    }
);

// Check email verification and trigger admin notification
export const checkEmailVerification = onCall(async (request) => {
    const userId = request.auth?.uid;

    if (!userId) {
        throw new Error("Not authenticated");
    }

    try {
        // Get user record to check email verification
        const userRecord = await admin.auth().getUser(userId);

        if (!userRecord.emailVerified) {
            return { verified: false };
        }

        const db = admin.firestore();

        // Find the user's application
        const snapshot = await db
            .collection("membershipApplications")
            .where("userId", "==", userId)
            .where("status", "==", "pending")
            .where("adminNotified", "==", false)
            .limit(1)
            .get();

        if (snapshot.empty) {
            return { verified: true, notificationSent: false };
        }

        const doc = snapshot.docs[0];
        const data = doc.data();

        // Use transaction to prevent duplicate notifications
        let emailSent = false;

        await db.runTransaction(async (transaction) => {
            const freshDoc = await transaction.get(doc.ref);
            const freshData = freshDoc.data();

            // Check if already notified within transaction
            if (freshData?.adminNotified === true) {
                logger.info(`Admin already notified for ${data.email} (checked in transaction)`);
                return;
            }

            // Send admin notification
            const { name, email, phone, city, state, profession } = freshData || {};
            const adminEmail = "vokkaligasangam@gmail.com";

            const mailOptions = {
                from: "VMSNA <vokkaligasangam@gmail.com>",
                to: adminEmail,
                subject: "🔔 New VMSNA Membership Application",
                html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #d9a441;">New Membership Application</h2>
          <p>A new member has registered and verified their email.</p>
          
          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 8px 0;"><strong>Name:</strong> ${name || "N/A"}</p>
            <p style="margin: 8px 0;"><strong>Email:</strong> ${email || "N/A"} ✓ Verified</p>
            <p style="margin: 8px 0;"><strong>Phone:</strong> ${phone || "N/A"}</p>
            <p style="margin: 8px 0;"><strong>Location:</strong> ${city || "N/A"}, ${state || "N/A"}</p>
            <p style="margin: 8px 0;"><strong>Profession:</strong> ${profession || "N/A"}</p>
          </div>
          
          <p><a href="https://vmsna.web.app/admin.html" style="display: inline-block; background: #0ea5a4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">Review Application</a></p>
          
          <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;">
          <p style="color: #666; font-size: 14px;">
            This is an automated notification from the VMSNA membership system.
          </p>
        </div>
      `,
            };

            await gmailTransporter.sendMail(mailOptions);
            logger.info(`Admin notification sent after email verification: ${name} (${email})`);

            // Mark as notified within transaction
            transaction.update(doc.ref, { adminNotified: true });
            emailSent = true;
        });

        return { verified: true, notificationSent: emailSent };
    } catch (error) {
        logger.error("Error in checkEmailVerification:", error);
        throw new Error(`Failed to process: ${error}`);
    }
});

// Scheduled function to check for verified users and send admin notifications
// Runs every 5 minutes
export const checkVerifiedUsers = onSchedule(
    {
        schedule: "every 5 minutes",
        timeZone: "America/Los_Angeles",
        region: "us-central1",
    },
    async () => {
        logger.info("Running scheduled check for verified users...");

        try {
            const db = admin.firestore();

            // Find pending applications that haven't been notified yet
            const snapshot = await db
                .collection("membershipApplications")
                .where("status", "==", "pending")
                .where("adminNotified", "==", false)
                .get();

            if (snapshot.empty) {
                logger.info("No unnotified pending applications found");
                return;
            }

            logger.info(`Found ${snapshot.size} unnotified applications to check`);

            const adminEmail = "vokkaligasangam@gmail.com";
            let notificationsSent = 0;

            for (const doc of snapshot.docs) {
                const data = doc.data();
                const { userId, name, email, phone, city, state, profession } = data;

                try {
                    // Check if user has verified their email
                    const userRecord = await admin.auth().getUser(userId);

                    if (!userRecord.emailVerified) {
                        logger.info(`User ${email} has not verified email yet, skipping...`);
                        continue;
                    }

                    // Use transaction to prevent duplicate notifications
                    await db.runTransaction(async (transaction) => {
                        const freshDoc = await transaction.get(doc.ref);
                        const freshData = freshDoc.data();

                        // Double-check within transaction
                        if (freshData?.adminNotified === true) {
                            logger.info(`Admin already notified for ${email} (checked in transaction)`);
                            return;
                        }

                        // Send admin notification
                        const mailOptions = {
                            from: "VMSNA <vokkaligasangam@gmail.com>",
                            to: adminEmail,
                            subject: "🔔 New VMSNA Membership Application",
                            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #d9a441;">New Membership Application</h2>
          <p>A new member has registered and verified their email.</p>
          
          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 8px 0;"><strong>Name:</strong> ${name || "N/A"}</p>
            <p style="margin: 8px 0;"><strong>Email:</strong> ${email || "N/A"} ✓ Verified</p>
            <p style="margin: 8px 0;"><strong>Phone:</strong> ${phone || "N/A"}</p>
            <p style="margin: 8px 0;"><strong>Location:</strong> ${city || "N/A"}, ${state || "N/A"}</p>
            <p style="margin: 8px 0;"><strong>Profession:</strong> ${profession || "N/A"}</p>
          </div>
          
          <p><a href="https://vmsna.web.app/admin.html" style="display: inline-block; background: #0ea5a4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">Review Application</a></p>
          
          <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;">
          <p style="color: #666; font-size: 14px;">
            This is an automated notification from the VMSNA membership system.
          </p>
        </div>
      `,
                        };

                        await gmailTransporter.sendMail(mailOptions);
                        logger.info(`Admin notification sent for verified user: ${name} (${email})`);

                        // Mark as notified within transaction
                        transaction.update(doc.ref, { adminNotified: true });
                        notificationsSent++;
                    });
                } catch (error) {
                    logger.error(`Error processing user ${email}:`, error);
                    // Continue with next user
                }
            }

            logger.info(`Scheduled check complete. Sent ${notificationsSent} notifications.`);
        } catch (error) {
            logger.error("Error in scheduled verification check:", error);
        }
    });

// Get user's email verification status (for admin panel)
export const getUserVerificationStatus = onCall({
    region: "us-central1",
    invoker: "public"
}, async (request) => {
    const { userId } = request.data;

    if (!userId) {
        throw new Error("Missing userId");
    }

    try {
        const userRecord = await admin.auth().getUser(userId);
        return {
            emailVerified: userRecord.emailVerified,
            email: userRecord.email,
        };
    } catch (error) {
        logger.error(`Error fetching verification status for ${userId}:`, error);
        throw new Error(`Failed to get user status: ${error}`);
    }
});
