# Quick Guide: Fixing Hasini's Account

## Problem
Hasini registered and verified her email, but the admin notification was never sent because:
1. She verified her email ✅
2. She never logged into the dashboard ❌
3. The old system required login to trigger the notification

## Solution
We've implemented an **automatic scheduled function** that checks every 5 minutes for verified users and sends notifications automatically. No login required!

## Fix Hasini Now (One-Time)

### Option 1: Use the Fix Tool (Easiest)
1. Go to: https://vmsna.web.app/fix-hasini.html
2. Login as admin (vikramkanagaraj@gmail.com or vokkaligasangam@gmail.com)
3. Click "Fix Hasini's Account"
4. Wait 5 minutes
5. Check vokkaligasangam@gmail.com for notification

### Option 2: Firebase Console
1. Go to: https://console.firebase.google.com/project/vmsna-e9bd0/firestore
2. Open `membershipApplications` collection
3. Find Hasini's document (email: hasini.sivanan@gmail.com)
4. Edit the document
5. Set `adminNotified` to `false`
6. Save
7. Wait 5 minutes for scheduled function

### Option 3: Manual Notify Tool (Requires Hasini to Login)
1. Ask Hasini to go to: https://vmsna.web.app/manual-notify.html
2. She logs in
3. Clicks "Check Verification and Notify Admin"
4. Admin receives notification immediately

## How the New System Works

### Timeline
- **12:00 PM** - Member registers
- **12:05 PM** - Member clicks verification link
- **12:10 PM** - Scheduled function runs ✅ Admin notified
- **Later** - Member logs in (optional, no duplicate notification)

### Before (Old System)
```
Register → Verify → Login Required → Notification Sent
```

### Now (New System)
```
Register → Verify → Automatic Check (5 min) → Notification Sent
```

## Verification Steps

After fixing Hasini's account:

1. **Check Firestore** (after 5-10 min)
   - Open Hasini's document
   - Verify `adminNotified: true`

2. **Check Email**
   - Login to vokkaligasangam@gmail.com
   - Look for "New VMSNA Membership Application" email
   - Subject should have 🔔 emoji

3. **Check Logs** (if needed)
   ```bash
   firebase functions:log --only checkVerifiedUsers
   ```

## Scheduled Function Details

- **Name**: `checkVerifiedUsers`
- **Schedule**: Every 5 minutes
- **Query**: `status=='pending' && adminNotified==false`
- **Cost**: Free (within free tier)
- **Runs**: 288 times/day = ~8,640 times/month (way under 2M free limit)

## Testing Future Registrations

1. Register new test account
2. Verify email (click link)
3. **Don't login**
4. Wait 5 minutes
5. Admin should receive notification
6. Login to dashboard (should work normally, no duplicate notification)

## Troubleshooting

### Email not received after 10 minutes?
1. Check spam folder in vokkaligasangam@gmail.com
2. Verify Firebase deployment completed:
   ```bash
   firebase functions:list
   ```
   Should show `checkVerifiedUsers` function

3. Check function logs:
   ```bash
   firebase functions:log --only checkVerifiedUsers
   ```

### Still not working?
Use manual notify tool as backup:
- https://vmsna.web.app/manual-notify.html
- Requires user to login once
- Sends notification immediately

## Admin Access

Current admin emails (can access admin.html and fix-hasini.html):
- vikramkanagaraj@gmail.com
- vokkaligasangam@gmail.com
- Add more in public/admin.html and public/fix-hasini.html

Notification recipient:
- vokkaligasangam@gmail.com (receives all new application emails)

## Files Modified

1. **functions/src/index.ts** - Added `checkVerifiedUsers` scheduled function
2. **public/membership.html** - Added `adminNotified: false` to new registrations
3. **public/fix-hasini.html** - New tool to fix existing accounts
4. **firestore.indexes.json** - Added composite index for scheduled query
5. **AUTOMATIC_NOTIFICATION_SYSTEM.md** - Full documentation

## Next Steps

1. Deploy the changes (in progress)
2. Fix Hasini's account using fix-hasini.html
3. Wait 5 minutes
4. Verify admin receives email
5. Test with new registration
6. Monitor for 24 hours to ensure it's working

## Success Criteria

✅ Hasini's adminNotified set to false
✅ Scheduled function deployed
✅ Firestore index created
✅ Admin receives email within 5-10 minutes
✅ No duplicate emails on login
✅ Future registrations work automatically
