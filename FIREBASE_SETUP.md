# Firebase Setup for Media Library

## Step 1: Get Firebase Service Account Credentials

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **artisan-agentstack**
3. Click ⚙️ **Project Settings** (bottom left)
4. Go to **Service Accounts** tab
5. Click **Generate New Private Key**
6. A JSON file will download - save it safely

## Step 2: Update `.env.local`

Copy the following from the downloaded JSON file into `.env.local`:

```env
FIREBASE_ADMIN_PROJECT_ID=<project_id>
FIREBASE_ADMIN_CLIENT_EMAIL=<client_email>
FIREBASE_ADMIN_PRIVATE_KEY=<private_key>
```

**Important:** 
- The `private_key` should include the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` markers
- Replace literal newlines with `\n` in the key

## Step 3: Verify Storage Bucket Exists

1. In Firebase Console, go to **Storage**
2. Verify bucket named `artisan-agentstack.appspot.com` exists
3. If not, click **Start** to create one

## Step 4: Check Firestore Security Rules

Go to **Firestore Database** > **Rules** and ensure the rules allow writes to media collections:

```
match /subAccounts/{id}/mediaAssets/{document=**} {
  allow write: if request.auth != null;
  allow read: if request.auth != null;
}
```

## Step 5: Restart Development Server

```bash
npm run dev
```

## Troubleshooting

- **"The specified bucket does not exist"**: Check bucket name matches `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- **Permission denied**: Verify Firebase Admin credentials and security rules
- **Still getting 500 error**: Check browser console and server logs for detailed error message

## What the code does now:

✅ Shows clear error messages instead of JSON parsing errors
✅ Logs errors to console for debugging
✅ Handles API failures gracefully
✅ Validates file types and sizes before upload
