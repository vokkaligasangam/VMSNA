# Firebase Setup Instructions for VSNA Website

## Overview
Your membership page is now configured to use Firebase for free backend database storage. Firebase provides:
- **Firestore Database**: NoSQL database for storing membership applications and member directory
- **Authentication**: Secure user login/signup with email and password
- **Free Tier**: Up to 50K reads, 20K writes, 20K deletes per day (sufficient for most community sites)

## Setup Steps

### 1. Create a Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Enter project name: `vsna-website` (or your preferred name)
4. Disable Google Analytics (optional) or configure it
5. Click "Create project"

### 2. Register Your Web App
1. In Firebase Console, click the **Web** icon (`</>`) to add a web app
2. Enter app nickname: `VSNA Website`
3. Check "Also set up Firebase Hosting" if you plan to use Firebase Hosting
4. Click "Register app"
5. Copy the `firebaseConfig` object shown

### 3. Update membership.html Configuration
1. Open `public/membership.html`
2. Find this section around line 210:
```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```
3. Replace with your actual Firebase configuration values

### 4. Enable Authentication
1. In Firebase Console, go to **Authentication** → **Sign-in method**
2. Enable **Email/Password** authentication
3. Click "Save"

### 5. Set Up Firestore Database
1. In Firebase Console, go to **Firestore Database**
2. Click "Create database"
3. Choose **Start in test mode** (for development)
4. Select a location (e.g., `us-central`)
5. Click "Enable"

### 6. Configure Firestore Security Rules
Replace the default rules in Firebase Console → Firestore Database → Rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Membership applications - anyone can create, only admins can read/update
    match /membershipApplications/{applicationId} {
      allow create: if request.auth != null;
      allow read, update: if request.auth != null && 
        get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.role == 'admin';
    }
    
    // Member directory - authenticated users can read, users can update their own
    match /members/{memberId} {
      allow read: if request.auth != null;
      allow create, update: if request.auth != null && 
        request.resource.data.userId == request.auth.uid;
      allow delete: if request.auth != null && 
        (resource.data.userId == request.auth.uid || 
         get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.role == 'admin');
    }
    
    // Admin roles - only admins can read/write
    match /admins/{adminId} {
      allow read, write: if request.auth != null && 
        get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.role == 'admin';
    }
  }
}
```

### 7. Create Initial Admin User (Optional)
To create an admin user who can view applications:

1. Create a regular account through the membership form
2. In Firestore Database, manually create a document:
   - Collection: `admins`
   - Document ID: Use the user's UID (from Authentication panel)
   - Fields:
     - `role`: `admin`
     - `email`: `admin@example.com`

## Database Structure

### Collections

#### `membershipApplications`
Stores new membership applications:
- `name`: string
- `nativePlaceSelf`: string
- `spouseName`: string
- `nativePlaceSpouse`: string
- `childrenDetails`: string
- `addressUSA`: string
- `email`: string
- `phone`: string
- `username`: string
- `userId`: string (Firebase Auth UID)
- `submittedAt`: timestamp
- `status`: string ('pending', 'approved', 'rejected')

#### `members`
Public member directory (visible after approval):
- `name`: string
- `location`: string
- `email`: string
- `phone`: string
- `userId`: string
- `updatedAt`: timestamp

#### `admins`
Admin users who can manage applications:
- `role`: string ('admin')
- `email`: string

## Features Implemented

### Membership Application Form
- ✅ Captures all required information
- ✅ Creates Firebase Auth account with email/password
- ✅ Stores application in Firestore
- ✅ Sends email verification

### Member Login
- ✅ Firebase Authentication
- ✅ Email/password login
- ✅ Session management
- ✅ Shows member directory after login

### Member Directory
- ✅ Real-time updates from Firestore
- ✅ Search functionality
- ✅ Add/update personal information
- ✅ Only authenticated users can access

## Testing

1. **Test Membership Registration**:
   - Fill out the form with valid email and password
   - Check Firebase Console → Authentication for new user
   - Check Firestore → membershipApplications for the data

2. **Test Login**:
   - Use the registered email as username
   - Enter the password
   - Member directory should appear

3. **Test Directory**:
   - Add your information to the directory
   - Check Firestore → members collection
   - Test search functionality

## Cost (Free Tier Limits)

Firebase Spark Plan (FREE):
- **Firestore**: 50K reads, 20K writes, 20K deletes per day
- **Authentication**: Unlimited users
- **Hosting**: 10 GB storage, 360 MB/day transfer
- **Storage**: 1 GB

This is more than sufficient for a community website with hundreds of members.

## Production Deployment

When ready for production:

1. Update Firestore rules to production mode
2. Enable email verification enforcement
3. Set up custom domain (if using Firebase Hosting)
4. Configure email templates in Firebase Console
5. Add reCAPTCHA for form protection
6. Set up backup strategy for Firestore data

## Support

For issues or questions:
- Firebase Documentation: https://firebase.google.com/docs
- Firebase Console: https://console.firebase.google.com/
- Stack Overflow: Tag your questions with `firebase` and `firestore`
