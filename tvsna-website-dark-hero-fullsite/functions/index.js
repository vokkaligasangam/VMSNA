const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();

// Configure your email transport (using Gmail as example)
// You'll need to set up an app-specific password in Gmail
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'vokkaligasangam@gmail.com',
        pass: functions.config().gmail.password // Set this with: firebase functions:config:set gmail.password="your-app-password"
    }
});

exports.sendCustomVerificationEmail = functions.auth.user().onCreate(async (user) => {
    const actionCodeSettings = {
        url: 'https://vmsna.org/membership.html',
        handleCodeInApp: true,
    };

    try {
        const link = await admin.auth().generateEmailVerificationLink(user.email, actionCodeSettings);

        const mailOptions = {
            from: 'Vokkaliga Mahajana Sangam North America <vokkaligasangam@gmail.com>',
            to: user.email,
            subject: 'Verify your VMSNA membership email',
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0ea5a4;">Welcome to VMSNA</h2>
          <p>Hello,</p>
          <p>Thank you for registering with <strong>Vokkaliga Mahajana Sangam North America (VMSNA)</strong>.</p>
          <p>Please verify your email address by clicking the button below:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${link}" style="background: #0ea5a4; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email Address</a>
          </div>
          <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
          <p style="color: #0ea5a4; word-break: break-all;">${link}</p>
          <p style="color: #666; font-size: 14px;">This link will expire in 24 hours.</p>
          <p style="color: #666; font-size: 14px;">If you did not create an account with VMSNA, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px;">
            <strong>Vokkaliga Mahajana Sangam North America</strong><br>
            Website: <a href="https://www.vmsna.org" style="color: #0ea5a4;">www.vmsna.org</a><br>
            Email: <a href="mailto:vokkaligasangam@gmail.com" style="color: #0ea5a4;">vokkaligasangam@gmail.com</a>
          </p>
        </div>
      `
        };

        await transporter.sendMail(mailOptions);
        console.log('Verification email sent to:', user.email);
    } catch (error) {
        console.error('Error sending verification email:', error);
    }
});
