# Gmail Password Security Fix

## Problem
The Gmail app password was hardcoded in the source code and committed to Git. This is a critical security vulnerability.

## Solution Steps

### Step 1: Set the Gmail Password as a Firebase Secret

Run this command to securely store the Gmail app password:

```bash
firebase functions:secrets:set GMAIL_APP_PASSWORD
```

When prompted, enter the Gmail app password: `hlmzkymawgrctphq`

### Step 2: Deploy the Updated Functions

```bash
firebase deploy --only functions
```

### Step 3: Revoke the Old Password and Create a New One

**IMPORTANT:** After deployment works, you MUST revoke the old app password and create a new one:

1. Go to https://myaccount.google.com/apppasswords
2. Sign in as vokkaligasangam@gmail.com
3. Find and **revoke** the app password `hlmzkymawgrctphq`
4. Create a **new** app password
5. Update the Firebase secret with the new password:
   ```bash
   firebase functions:secrets:set GMAIL_APP_PASSWORD
   ```
6. Deploy again:
   ```bash
   firebase deploy --only functions
   ```

### Step 4: Remove Password from Git History (Optional but Recommended)

The old password is still in Git history. Consider using `git filter-branch` or BFG Repo-Cleaner to remove it from history if the repository is public or shared.

## Verification

After deployment, test that emails are still being sent when:
- A user is approved
- A new user registers and verifies their email

The functions will now use the secure environment variable instead of the hardcoded password.
