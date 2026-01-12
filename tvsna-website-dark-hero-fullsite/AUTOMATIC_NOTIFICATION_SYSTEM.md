# Automatic Admin Notification System

## Overview
The system automatically sends admin notifications when new members verify their email, **without requiring the member to login to the dashboard**.

## How It Works

### 1. Member Registration Flow
1. Member registers at `/membership.html`
2. System creates Firestore document with `status: "pending"` and `adminNotified: false`
3. Verification email sent automatically

### 2. Email Verification
1. Member clicks link in verification email
2. Firebase Auth marks email as verified
3. **No admin notification yet** (member hasn't logged in)

### 3. Scheduled Automatic Check
A Cloud Function runs **every 5 minutes** to automatically check for newly verified members:

```typescript
export const checkVerifiedUsers = onSchedule("every 5 minutes", async () => {
  // Find pending applications where admin hasn't been notified
  const snapshot = await db
    .collection("membershipApplications")
    .where("status", "==", "pending")
    .where("adminNotified", "==", false)
    .get();

  for (const doc of snapshot.docs) {
    const userRecord = await admin.auth().getUser(userId);
    
    if (userRecord.emailVerified) {
      // Send admin notification
      // Mark as notified: adminNotified = true
    }
  }
});
```

### 4. Admin Notification Sent
Within **5 minutes** of email verification, admin receives notification at: **vokkaligasangam@gmail.com**

## Key Fields

### Firestore Document Fields
- `status`: "pending" | "approved" | "rejected"
- `adminNotified`: `false` (default) | `true` (notification sent)
- `userId`: Firebase Auth UID
- `email`: Member's email address
- Other member data (name, phone, city, etc.)

### Firebase Auth
- `emailVerified`: `true` after clicking verification link

## Functions

### 1. checkVerifiedUsers (Scheduled)
- **Trigger**: Runs every 5 minutes
- **Purpose**: Automatically check for verified users and notify admin
- **Query**: `status=='pending' && adminNotified==false`
- **Action**: Check Auth verification → Send email → Mark `adminNotified: true`

### 2. notifyAdminNewApplication (Firestore Trigger)
- **Trigger**: When document created in `membershipApplications`
- **Purpose**: Immediate notification if user is already verified (edge case)
- **Query**: N/A (document creation)
- **Action**: Check if verified → Send email → Mark `adminNotified: true`

### 3. checkEmailVerification (Callable)
- **Trigger**: Called when user logs into dashboard
- **Purpose**: Backup notification + verify access
- **Query**: N/A (callable function)
- **Action**: Check verification → Send email if not notified → Mark `adminNotified: true`

## Timeline Example

### Hasini's Case (Before Fix)
- 12:00 PM - Registered
- 12:05 PM - Verified email (clicked link)
- ❌ Admin never notified (waited for login that never happened)

### With Scheduled Function
- 12:00 PM - Member registers
- 12:05 PM - Member verifies email
- **12:10 PM - Scheduled function runs** ✅ Admin notified automatically
- 2:00 PM - Member logs in (no duplicate notification)

## Costs

### Free Tier (Blaze Plan)
- **Cloud Functions**: 2 million invocations/month free
- **Scheduled Function**: Runs 288 times/day (every 5 min) = ~8,640/month
- **Gmail SMTP**: 100 emails/day free
- **Cost**: $0.00 (well within free tier)

## Firestore Index Required

```json
{
  "collectionGroup": "membershipApplications",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "adminNotified", "order": "ASCENDING" }
  ]
}
```

## Admin Tools

### 1. Admin Panel (`/admin.html`)
Review and approve/reject applications

### 2. Fix Tool (`/fix-hasini.html`)
One-time tool to set `adminNotified: false` for Hasini's account so scheduled function picks it up

### 3. Manual Notify (`/manual-notify.html`)
Emergency backup to manually trigger notification (requires user login)

## Testing

1. Register new test account
2. Verify email (click link)
3. Wait 5-10 minutes
4. Check vokkaligasangam@gmail.com for notification
5. Verify Firestore document has `adminNotified: true`

## Troubleshooting

### Admin not receiving emails?
1. Check spam/junk folder
2. Verify Gmail app password is configured: `hlmzkymawgrctphq`
3. Check Firebase Functions logs: `firebase functions:log`

### Scheduled function not running?
1. Check deployment: `firebase deploy --only functions`
2. View logs: `firebase functions:log --only checkVerifiedUsers`
3. Verify in Firebase Console: Functions → checkVerifiedUsers

### Member still pending after verification?
1. Use `/fix-hasini.html` to reset `adminNotified: false`
2. Wait 5 minutes for scheduled function
3. Or use `/manual-notify.html` as immediate workaround

## Security

- Only pending applications are checked (not approved/rejected)
- Prevents duplicate notifications with `adminNotified` flag
- Admin emails whitelist enforced in frontend
- Firestore rules require admin auth for application updates

## Future Enhancements

1. **Dashboard for admins**: Show notification history
2. **Email templates**: Customize notification content
3. **Multiple notification types**: Approval, rejection, etc.
4. **Analytics**: Track notification delivery rates
5. **Webhook alternative**: Replace scheduled function with real-time webhook if Firebase adds email verification trigger

## References

- Cloud Functions Scheduler: https://firebase.google.com/docs/functions/schedule-functions
- Firebase Auth Admin SDK: https://firebase.google.com/docs/auth/admin
- Gmail SMTP: https://support.google.com/mail/answer/7126229
