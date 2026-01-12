# VMSNA Member Approval System - Setup Guide

This guide will help you set up the complete member approval system with email notifications.

## Overview

The approval system ensures only reviewed members can access the member directory:
- **New registrations**: Start with `status='pending'` → Can't access directory
- **Admin review**: Approve or reject applications via admin panel
- **Email notification**: Approved members receive automatic email via Gmail SMTP
- **Existing members**: Must be migrated to `status='approved'` before deployment

---

## 🚨 CRITICAL: Pre-Deployment Steps

### Step 1: Run Migration Script (ONE TIME ONLY)

**IMPORTANT**: You must approve all existing ~500 members BEFORE deploying the approval system, or they will lose access!

1. Open your browser to: `http://localhost:5000/migrate-approve-existing.html` (or the deployed URL)
2. Login with your admin credentials
3. Click "Start Migration"
4. Wait for confirmation that all members were approved
5. Verify in Firebase Console that all existing members have `status='approved'`

**Note**: This script is safe to run multiple times - it only updates pending members.

---

## ⚙️ Configuration Required

### 1. Update Admin Email Whitelist

Edit [public/admin.html](public/admin.html) line 114:

```javascript
const ADMIN_EMAILS = [
    'your-actual-admin-email@gmail.com',  // Replace this!
    'another-admin@gmail.com',            // Add more admins as needed
];
```

### 2. Set Up Gmail SMTP

#### A. Create Gmail App Password

1. Go to your Google Account: https://myaccount.google.com/
2. Navigate to **Security** → **2-Step Verification** (enable if not already)
3. Scroll to **App passwords** → **Create new app password**
4. Select app: "Mail" | Select device: "Other (Custom name)" → Enter "VMSNA"
5. Click **Generate** → Copy the 16-character password (e.g., `abcd efgh ijkl mnop`)

#### B. Update Cloud Function

Edit [functions/src/index.ts](functions/src/index.ts) lines 31-36:

```typescript
const gmailTransporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "your-vmsna-email@gmail.com",      // Your Gmail address
    pass: "abcd efgh ijkl mnop",              // App password from step A (no spaces)
  },
});
```

Also update line 49 with your Gmail:
```typescript
from: "VMSNA <your-vmsna-email@gmail.com>",
```

**Gmail Limit**: 100 emails/day (free tier) - sufficient for approval notifications

---

## 📦 Installation & Deployment

### 1. Install Dependencies

```powershell
cd "c:\TVSNA Website\tvsna-website-dark-hero-fullsite\functions"
npm install
```

This installs `nodemailer` for email functionality.

### 2. Build Cloud Functions

```powershell
npm run build
```

### 3. Test Locally (Optional)

```powershell
firebase emulators:start
```

Then:
1. Open `http://localhost:5000/migrate-approve-existing.html` → Run migration
2. Open `http://localhost:5000/admin.html` → Login and test approval
3. Check console for email logs (emails won't actually send in emulator)

### 4. Deploy Everything

```powershell
firebase deploy
```

This deploys:
- Hosting (admin.html, migrate-approve-existing.html, updated dashboard.html)
- Cloud Functions (sendApprovalEmail)

---

## 🔧 How It Works

### New Member Registration Flow

1. User fills out [membership.html](public/membership.html)
2. Application saved to Firestore with `status='pending'`
3. User can login but sees "Application Under Review" message
4. Member directory is hidden from pending users

### Admin Approval Flow

1. Admin visits [admin.html](public/admin.html)
2. Admin email checked against whitelist
3. Pending applications displayed with all details
4. Admin clicks "✓ Approve" or "✗ Reject"
5. Firestore updated: `status='approved'` + `approvedAt` + `approvedBy`
6. Cloud Function triggered → Email sent via Gmail SMTP
7. User refreshes dashboard → Full access granted

### Dashboard Access Control

File: [public/dashboard.html](public/dashboard.html)

```javascript
// After loading user details, check status:
if (data.status === 'pending') {
    // Show "under review" message
    // Hide directory
    window.userIsPending = true;
}

if (data.status === 'rejected') {
    // Logout and redirect
}

// When loading directory:
if (window.userIsPending) return;  // Skip loading

// Query only approved members:
db.collection('membershipApplications')
  .where('status', '==', 'approved')
  .get()
```

---

## 📧 Email Template

Approved members receive:

**Subject**: 🎉 Your VMSNA Membership Has Been Approved!

**Body**:
> Dear [Name],
>
> We are pleased to inform you that your membership application has been **approved**!
>
> You now have full access to the VMSNA member directory and all member benefits.
>
> [Access Your Dashboard Button]
>
> Thank you for joining the Vokkaliga Mahajana Sangam North America community!

---

## 🧪 Testing Checklist

After deployment, test these scenarios:

- [ ] **Existing Member**: Login → Should see full directory (status='approved')
- [ ] **New Registration**: Submit form → Should see "Application Under Review"
- [ ] **Admin Access**: Login to admin.html → Should see pending applications
- [ ] **Non-Admin**: Try admin.html → Should be denied access
- [ ] **Approval**: Click "✓ Approve" → Check email received + directory access
- [ ] **Rejection**: Click "✗ Reject" → User should be logged out on next login

---

## 🐛 Troubleshooting

### Issue: "Access denied. Admin privileges required."
**Solution**: Add your email to `ADMIN_EMAILS` array in admin.html (line 114)

### Issue: Approval email not sending
**Checks**:
1. Verify Gmail app password is correct (no spaces)
2. Check Firebase Functions logs: `firebase functions:log`
3. Ensure 2-Step Verification is enabled on Gmail account
4. Try regenerating app password

### Issue: Existing members can't access directory
**Solution**: Run migration script at `/migrate-approve-existing.html` to approve all

### Issue: "Failed to send email: Invalid login"
**Solution**: You may be using your regular Gmail password instead of an app password

### Issue: Cloud Function timeout
**Solution**: Gmail SMTP is fast, but check function logs for network issues

---

## 📊 Monitoring

### Firebase Console

1. **Database**: Monitor pending applications count
   - Go to Firestore → membershipApplications → Filter `status == 'pending'`

2. **Functions**: Check email sending success rate
   - Go to Functions → sendApprovalEmail → Logs

3. **Usage**: Track Cloud Function invocations
   - Functions → Usage → Should be low (only on approvals)

### Admin Panel Stats

The admin panel automatically shows count of pending applications.

---

## 🔐 Security Considerations

1. **Admin Whitelist**: Only emails in `ADMIN_EMAILS` can access admin panel
2. **Email Privacy**: Approval emails sent individually (not BCC)
3. **Gmail Security**: Uses app passwords (not main password)
4. **Firestore Rules**: Should restrict status field updates to authenticated users

### Recommended Firestore Security Rules

```javascript
match /membershipApplications/{docId} {
  // Anyone can create (register)
  allow create: if request.auth != null;
  
  // Users can read their own data
  allow read: if request.auth != null && request.auth.uid == docId;
  
  // Only admins can update status
  allow update: if request.auth != null && 
                request.auth.token.email in [
                  'your-admin@gmail.com'  // Match ADMIN_EMAILS
                ];
}
```

---

## 💰 Cost Estimate

- **Gmail SMTP**: FREE (100 emails/day)
- **Cloud Functions**: ~$0.0001 per approval (negligible)
- **Firestore Reads**: ~$0.06 per 100,000 reads
- **Hosting**: FREE (Firebase Spark plan)

**Expected monthly cost**: < $1 for typical usage

---

## 📝 Future Enhancements

Ideas for extending the system:

1. **Bulk Actions**: Approve multiple applications at once
2. **Rejection Emails**: Notify rejected applicants (optional)
3. **Approval Comments**: Add notes visible only to admins
4. **Email Templates**: Different templates for different member types
5. **Webhook Notifications**: Slack/Discord alerts on new applications
6. **Analytics Dashboard**: Track approval rates, processing time

---

## ✅ Quick Reference

| File | Purpose | Requires Update |
|------|---------|-----------------|
| `public/admin.html` | Admin panel UI | ✅ Update ADMIN_EMAILS |
| `functions/src/index.ts` | Email sending logic | ✅ Update Gmail credentials |
| `functions/package.json` | Add nodemailer dependency | ✅ Already done |
| `public/dashboard.html` | Status-based access control | ✅ Already done |
| `public/migrate-approve-existing.html` | One-time migration | ⚠️ Run before deploy |

---

## 🆘 Need Help?

1. Check Firebase Functions logs: `firebase functions:log`
2. Check browser console for JavaScript errors
3. Verify Firestore data structure in Firebase Console
4. Test email sending with a test account first

---

**Ready to deploy?** Follow steps in order:
1. ✅ Run migration script
2. ✅ Update admin emails
3. ✅ Configure Gmail SMTP
4. ✅ Deploy with `firebase deploy`
5. ✅ Test all scenarios

Good luck! 🚀
