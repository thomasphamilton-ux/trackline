# Trackline

Asset install and energization tracker: per-project equipment lists, the energization
stage sequence (Installed → Terminated → EC FOD → L2's Complete → INT FOD → FTE, then
turnover to IFS Services), QR and barcode scanning, CSV import/export, role-based access
(Admin / Supervisor / Contractor / View only) and password reset with optional SMS.

React + TypeScript + Vite front end, Firebase for sign-in, data and backend functions.

| Path | What it is |
|---|---|
| `src/domain/` | Business rules with no UI: stage sequence, roles, equipment model, the DNN4 hall generator, CSV. Start here. |
| `src/lib/` | Firebase setup, data access, session store. |
| `src/screens/`, `src/components/` | The app's screens. |
| `firestore.rules` | Server-side security rules. These do the real access control. |
| `functions/` | Cloud Functions for password reset, SMS and account disable/enable. |
| `tests/` | Domain tests (`npm test`) and security-rules tests (`npm run test:rules`). |
| `legacy/index.html` | The previous single-file app, kept for reference. |
| `SETUP.md` | First-time Firebase setup (project, sign-in, first Admin, SMS secrets). |

## Develop

Needs Node.js 20 or newer, and Java 11+ for the Firebase emulators.

```
npm install
npm test                 # domain tests
npm run test:rules       # security rules, against the Firestore emulator
npm run emulators        # local Firebase (auth + database) — leave running
# in a second terminal:
set VITE_USE_EMULATORS=1 && npm run dev     (Windows cmd)
VITE_USE_EMULATORS=1 npm run dev            (macOS / Linux / Git Bash)
```

The emulator never touches the live `trackline-prod` project.

## Release

1. `npm run build` — produces the `dist/` folder.
2. Upload the **contents** of `dist/` to the web folder on the IONOS server
   (the same place `index.html` went before). It works from any folder, so you can
   upload to a test folder first.
3. Deploy the security rules and functions to the live project:
   ```
   npx firebase deploy --only firestore:rules --project trackline-prod
   npx firebase deploy --only functions --project trackline-prod
   ```

The v0.2 rules store stages by name and add the View-only role. Deploy them together
with the v0.2 app: the old single-file app in `legacy/` can't write under these rules.
