# Trackline — self-hosted setup

(This guide predates v0.2. Steps 1–5 still apply. For building and hosting the app, see README.md → Release.)

This bundle has three files:

- `index.html` — the whole app (one file, same as before, now talking to Firebase instead of Claude)
- `firestore.rules` — server-side security rules enforcing Admin / Supervisor / Contractor
- `SETUP.md` — this guide

Nothing else is required. `index.html` can be served by literally any static web server —
Nginx, Apache, Netlify, Vercel, S3, whatever you already run. Firebase only provides the
database and login; it doesn't need to host the file itself.

## 1. Create the Firebase project

1. Go to https://console.firebase.google.com and click **Add project**. Name it whatever
   you like (e.g. "trackline-prod"). You can skip Google Analytics.
2. Once it's created, click the **web** icon (`</>`) to register a web app. Give it a
   nickname; you don't need Firebase Hosting for this step.
3. Firebase shows you a `firebaseConfig` object — copy it.

## 2. Paste your config into index.html

Near the top of `index.html`, replace this block with the values Firebase gave you:

```js
window.FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

This is not a secret — it's fine for it to be visible in the page source. Access is
controlled by the security rules (step 4), not by hiding this config.

## 3. Turn on Firestore and Email/Password sign-in

1. In the Firebase console sidebar: **Build → Firestore Database → Create database**.
   Choose a region close to your crews, and start in **production mode** (the rules
   file in this bundle replaces the default deny-all).
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable.**

## 4. Deploy the security rules

Easiest path (no command line): in the Firebase console, go to
**Firestore Database → Rules**, delete what's there, paste in the contents of
`firestore.rules`, and click **Publish**.

(If you prefer the CLI: `firebase deploy --only firestore:rules` after running
`firebase init firestore` in this folder and pointing it at your project.)

## 5. Create your account and make yourself the first Admin

Firebase Auth has no built-in "owner" — the first Admin has to be set by hand once:

1. Host `index.html` somewhere temporarily (even just opening it locally works for this
   one-time step) and sign up for an account with your email and password.
2. In the Firebase console: **Authentication → Users**, find your account, and copy its
   **User UID**.
3. Go to **Firestore Database → Data**, and create a new collection called `admins`.
   Add one document to it:
   - **Document ID**: paste your UID
   - Fields: `name` (string, your name), `addedAt` (number, any timestamp e.g. `1`)
4. Refresh the app and sign in again. You're now an Admin — you can create projects and
   approve everyone else through the app's own "Users" panel from here on. No more manual
   console steps are needed after this.

## 6. Host the file

Copy `index.html` to wherever you want it served from — it's a single static file, so
any of these work:

- Drop it in your existing web server's document root (Nginx, Apache, IIS)
- `npx serve .` for a quick local test
- Netlify / Vercel / GitHub Pages / S3 + CloudFront — drag-and-drop deploy

One requirement: it needs to be served over **HTTPS** (or `http://localhost` for local
testing) — browsers block camera access (`getUserMedia`, used for QR/barcode scanning)
on plain HTTP. Firebase Auth also expects HTTPS in production. Most static hosts give
you HTTPS by default; if you're using your own server, put it behind a TLS certificate
(e.g. Let's Encrypt via Certbot).

## 7. Deploy the password-reset function (optional, but needed for Admins/Supervisors to reset someone's password)

Firebase's client SDK has no way for one signed-in user to set another user's password —
only server-side code with the Admin SDK can do that. The `functions/` folder in this
bundle is a small Cloud Function that does exactly that, safely (it re-checks the
caller's role in Firestore itself, it doesn't trust the browser) — and, if the target
user has a mobile number on file, texts them the temporary password directly via Twilio.

This step requires upgrading your Firebase project to the **Blaze (pay-as-you-go)**
plan — Cloud Functions aren't available on the free Spark plan. Blaze still has a
free monthly quota that easily covers a tool like this; you're billed only if you
exceed it. Twilio itself is a separate account and has its own (small, per-message)
cost — a trial account is enough to test with.

1. In the Firebase console: **⚙ Project settings → Usage and billing → Modify plan →
   Blaze**, and attach a billing account.
2. Install the Firebase CLI if you don't have it: `npm install -g firebase-tools`,
   then `firebase login`.
3. From this bundle's folder: `firebase use --add` and pick your project.
4. `cd functions && npm install && cd ..`
5. **Set up Twilio** (skip this and step 6 if you're fine with manual-only relay —
   the reset still works without it, it just won't text anyone):
   - Sign up at https://www.twilio.com/try-twilio and verify your own phone number.
   - From the Twilio console, copy your **Account SID** and **Auth Token**.
   - Get a Twilio phone number capable of sending SMS (a free trial number works for
     testing; a paid number is needed for real use since trial numbers can only text
     phone numbers you've manually verified in the Twilio console).
6. **Store the Twilio credentials as Firebase secrets** (never put these in
   `index.html` or anywhere client-side):
   ```
   firebase functions:secrets:set TWILIO_ACCOUNT_SID
   firebase functions:secrets:set TWILIO_AUTH_TOKEN
   firebase functions:secrets:set TWILIO_FROM_NUMBER
   ```
   Each command prompts you to paste the value. For `TWILIO_FROM_NUMBER`, use the
   full number in E.164 format, e.g. `+15551234567`.
7. `firebase deploy --only functions`

No client code changes are needed — `index.html` already calls `resetUserPassword`
by name and adapts its message depending on whether a text actually went out.

**How the reset actually works:** an Admin or Supervisor opens a project's Users panel,
clicks **Reset password** next to someone's name. If that person has added a mobile
number to their profile (the 📱 icon on the Projects screen), they're texted the new
temporary password immediately; either way, the Admin/Supervisor also sees it on
screen as a fallback, in case the text doesn't arrive or no number is on file, to relay
however they'd like (call, in person, etc.). The next time that person signs in with
the temporary password, they're immediately required to set their own new password
before they can do anything else in the app. Supervisors can only reset Contractors and
Supervisors within their own project; only Admins can reset anyone, anywhere.

**Disabling an account:** the same Users panel has a **Disable** button next to each
member (same boundary as reset — Supervisors can only disable Contractors/Supervisors
in their own project; Admins can disable anyone but themselves). A disabled account
can no longer sign in at all, and if they're already signed in somewhere, their session
is force-ended within moments rather than waiting for it to naturally expire. Clicking
**Enable** on a disabled account restores their access immediately, at whatever role
they already had — nothing else about their account changes.

## How people get in from here

- Anyone can open the page and create an account (email + password).
- A brand-new account has no project access — they'll see a "Request access" screen
  listing project names.
- Whoever supervises that project (or any Admin) opens the project's **Users** panel
  (👥 icon) and approves the request with a role.
- Admins create new projects from the Projects screen.
- If someone forgets their password, an Admin or their project's Supervisor can reset
  it from that same Users panel (see step 7 above) — the person sets their own new
  password the next time they sign in.
- That same panel lets an Admin or Supervisor disable/re-enable someone's account —
  useful for a contractor who's left the project, for example.
- Everyone should add their mobile number under the 📱 icon so password resets can
  reach them by text instead of relying on someone relaying it in person.

## What changed from the Claude-hosted version

- **Login is now real** (email + password) instead of your Claude account.
- **Offline handling is now automatic** — Firestore's own client caches writes locally
  and replays them when the connection comes back, including surviving a page reload
  while offline. The app no longer needs its own queue for this.
- **Roles are now actually enforced server-side**, not just hidden in the UI — the rules
  file means a Contractor's browser literally cannot write to a project they're not a
  member of, even by circumventing the interface.
- **File downloads** (CSV export, QR labels) now save directly via the browser instead
  of going through Claude.
- **Change password** — anyone signed in can change their own password from the 🔑 icon
  on the Projects screen (requires entering their current password first).

## If something's not working

- Blank screen / stuck on "Checking your access…": open the browser console (F12) —
  a `permission-denied` error almost always means the rules haven't been published yet,
  or you haven't created your `admins/{uid}` document.
- Camera won't open: confirm the page is on HTTPS, and that camera permission wasn't
  denied for the site.
- "Email already in use" on sign-up: that person already has an account — they should
  sign in instead, then request access to the project.
