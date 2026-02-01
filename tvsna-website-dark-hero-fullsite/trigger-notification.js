// Temporary script to manually trigger admin notification for babejascorp28@gmail.com
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

// Initialize Firebase Admin
const serviceAccount = require('./vmsna-e9bd0-firebase-adminsdk-iqt3x-d882cf5fcd.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Get Gmail password from environment or use placeholder
const gmailPassword = process.env.GMAIL_APP_PASSWORD || 'YOUR_NEW_PASSWORD_HERE';

const gmailTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: "vokkaligasangam@gmail.com",
        pass: gmailPassword,
    },
});

async function sendNotification() {
    try {
        // Find babejascorp28@gmail.com's application
        const snapshot = await db.collection('membershipApplications')
            .where('email', '==', 'babejascorp28@gmail.com')
            .where('status', '==', 'pending')
            .where('adminNotified', '==', false)
            .get();

        if (snapshot.empty) {
            console.log('No pending unnotified application found for babejascorp28@gmail.com');
            console.log('Possible reasons:');
            console.log('- Already notified (adminNotified = true)');
            console.log('- Status is not pending');
            console.log('- Email address mismatch');
            return;
        }

        const doc = snapshot.docs[0];
        const data = doc.data();
        const { name, email, phone, city, state, profession } = data;

        console.log('Found application:', { name, email });

        const mailOptions = {
            from: "VMSNA <vokkaligasangam@gmail.com>",
            to: "vokkaligasangam@gmail.com",
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
        console.log('✅ Admin notification sent successfully!');

        // Mark as notified
        await doc.ref.update({ adminNotified: true });
        console.log('✅ Marked as notified in database');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    } finally {
        process.exit();
    }
}

sendNotification();
