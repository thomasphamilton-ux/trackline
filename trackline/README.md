# Trackline

Asset install/energization tracker with QR and barcode scanning, per-project dashboards,
role-based access (Admin / Supervisor / Contractor), CSV import/export, and password
reset with optional SMS. Single-file frontend, Firebase for auth/data/backend logic.

**Start here → [SETUP.md](./SETUP.md)** for the full walkthrough: creating the Firebase
project, enabling auth, deploying the security rules and Cloud Function, and hosting
the file itself.

## What's in this repo

| Path | What it is |
|---|---|
| `index.html` | The whole app — one self-contained file. Deploy it as-is to any static host. |
| `firestore.rules` | Server-side security rules. These do the real access-control enforcement, not just the UI. |
| `firestore.indexes.json` | Empty by default — Firestore will tell you if a query ever needs a composite index, and it goes here. |
| `firebase.json` | Firebase CLI project config (rules path, functions source, optional Hosting config). |
| `functions/` | The Cloud Function backing password reset, SMS, and account disable/enable — anything that needs the Admin SDK. |
| `SETUP.md` | Full deployment guide. |

## Before you push this anywhere public

`index.html` contains a Firebase **web config** (`apiKey`, `authDomain`, etc.) near the
top — that's meant to be public and is not a secret; access is controlled entirely by
`firestore.rules`, not by hiding this config. The things that *are* secret (Twilio
credentials) never live in this repo at all — they're stored in Google Secret Manager
via `firebase functions:secrets:set`, per SETUP.md.

Still, if you'd rather keep the whole thing private regardless, make the GitHub repo
**Private** when you create it — nothing here requires it to be public.

## Local development

There's no build step. Open `index.html` directly, or serve the folder locally:

```
npx serve .
```

Camera scanning (`getUserMedia`) requires either `https://` or `http://localhost` —
opening the file with `file://` won't let the scanner work.

## Deploying changes

```
firebase deploy --only firestore:rules   # after editing firestore.rules
firebase deploy --only functions         # after editing functions/index.js
```

Then push `index.html` (and anything else you changed) to wherever you're hosting the
frontend — see SETUP.md step 6.
