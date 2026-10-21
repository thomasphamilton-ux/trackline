import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import {
  connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
} from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";

/**
 * Firebase web config. This is public by design: access is enforced by firestore.rules,
 * not by hiding these values.
 */
const config = {
  apiKey: "AIzaSyD26xVGjv6A5vM24dLaJPKnanm-7spywaY",
  authDomain: "trackline-prod.firebaseapp.com",
  projectId: "trackline-prod",
  storageBucket: "trackline-prod.firebasestorage.app",
  messagingSenderId: "606354450329",
  appId: "1:606354450329:web:abd3b5b1febe4eb013d508",
};

export const usingEmulators = import.meta.env.VITE_USE_EMULATORS === "1";

export const app = initializeApp(usingEmulators ? { ...config, projectId: "demo-trackline", apiKey: "demo-key" } : config);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const functions = getFunctions(app);

if (usingEmulators) {
  const host = location.hostname || "127.0.0.1";
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
  connectFunctionsEmulator(functions, host, 5001);
}
