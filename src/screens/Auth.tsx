import { useState } from "react";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, updatePassword,
  EmailAuthProvider, reauthenticateWithCredential,
} from "firebase/auth";
import { deleteDoc, doc, setDoc } from "firebase/firestore";
import { auth } from "../lib/firebase";
import { cols } from "../lib/data";
import { useSession, toast } from "../lib/store";
import { errMsg } from "../lib/util";
import { Modal } from "../components/Overlay";

export function AuthScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      if (mode === "signup") {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), pw);
        await updateProfile(cred.user, { displayName: name.trim() || email.split("@")[0] });
        useSession.getState().set({ name: name.trim() || email.split("@")[0] });
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), pw);
      }
    } catch (e2) { setErr(errMsg(e2)); } finally { setBusy(false); }
  };
  return (
    <div className="screen">
      <div className="auth-wrap">
        <div className="auth-brand">Trackline</div>
        <div className="auth-sub">Asset install and energization tracker</div>
        <form className="auth-form" onSubmit={submit}>
          {mode === "signup" && (
            <div>
              <label className="field-label" htmlFor="authName">Name</label>
              <input id="authName" autoComplete="name" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div>
            <label className="field-label" htmlFor="authEmail">Email</label>
            <input id="authEmail" type="email" autoComplete="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="authPw">Password</label>
            <input id="authPw" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required placeholder="At least 6 characters" value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          {err && <div className="auth-error">{err}</div>}
          <button className="btn-accent" type="submit" disabled={busy}>{mode === "signup" ? "Create account" : "Sign in"}</button>
        </form>
        <button className="btn-ghost" type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setErr(""); }}>
          {mode === "signup" ? "Already have an account? Sign in" : "Need an account? Create one"}
        </button>
      </div>
    </div>
  );
}

export function ForcePasswordScreen() {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [err, setErr] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (a.length < 6) return setErr("Password must be at least 6 characters.");
    if (a !== b) return setErr("Passwords don't match.");
    const user = auth.currentUser;
    if (!user) return setErr("You're not signed in.");
    try {
      await updatePassword(user, a);
      await deleteDoc(doc(cols.mustChange, user.uid));
      toast("Password updated.");
    } catch (e2) { setErr(errMsg(e2)); }
  };
  return (
    <div className="screen">
      <div className="auth-wrap">
        <div className="auth-brand">Set a new password</div>
        <div className="auth-sub">Your password was reset. Choose a new one to continue.</div>
        <form className="auth-form" onSubmit={submit}>
          <div>
            <label className="field-label" htmlFor="fpA">New password</label>
            <input id="fpA" type="password" autoComplete="new-password" required placeholder="At least 6 characters" value={a} onChange={(e) => setA(e.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="fpB">Confirm new password</label>
            <input id="fpB" type="password" autoComplete="new-password" required value={b} onChange={(e) => setB(e.target.value)} />
          </div>
          {err && <div className="auth-error">{err}</div>}
          <button className="btn-accent" type="submit">Set password and continue</button>
        </form>
      </div>
    </div>
  );
}

export function ProfileModal({ onClose }: { onClose: () => void }) {
  const s = useSession();
  const [name, setName] = useState(s.name);
  const [phone, setPhone] = useState(s.phone);
  const [err, setErr] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const n = name.trim(), p = phone.trim();
    if (!n) return setErr("Name can't be empty.");
    if (p && !/^\+[1-9]\d{6,14}$/.test(p)) return setErr("Enter the mobile number with a country code, e.g. +15551234567, or leave it blank.");
    const user = auth.currentUser;
    if (!user) return setErr("You're not signed in.");
    try {
      if (n !== s.name) await updateProfile(user, { displayName: n });
      await setDoc(doc(cols.users, user.uid), { name: n, phone: p }, { merge: true });
      s.set({ name: n, phone: p });
      toast("Profile saved.");
      onClose();
    } catch (e2) { setErr(errMsg(e2)); }
  };
  return (
    <Modal onClose={onClose} label="Your profile">
      <h3>Your profile</h3>
      <form className="auth-form" onSubmit={submit}>
        <div>
          <label className="field-label" htmlFor="pfName">Name</label>
          <input id="pfName" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="pfPhone">Mobile number</label>
          <input id="pfPhone" type="tel" autoComplete="tel" placeholder="+15551234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <div className="project-id-sub" style={{ marginTop: 4 }}>Include the country code (e.g. +1 for the US). Used so Admins and Supervisors can text you a temporary password if yours is ever reset.</div>
        </div>
        {err && <div className="auth-error">{err}</div>}
        <div className="modal-actions" style={{ marginTop: 4 }}>
          <button className="btn-ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn-accent" type="submit">Save</button>
        </div>
      </form>
    </Modal>
  );
}

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [cur, setCur] = useState("");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [err, setErr] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const user = auth.currentUser;
    if (!user?.email) return setErr("You're not signed in.");
    if (a.length < 6) return setErr("New password must be at least 6 characters.");
    if (a !== b) return setErr("New passwords don't match.");
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, cur));
      await updatePassword(user, a);
      toast("Password updated.");
      onClose();
    } catch (e2: any) {
      setErr(e2?.code === "auth/wrong-password" || e2?.code === "auth/invalid-credential" ? "Current password is incorrect." : errMsg(e2));
    }
  };
  return (
    <Modal onClose={onClose} label="Change password">
      <h3>Change password</h3>
      <form className="auth-form" onSubmit={submit}>
        <div>
          <label className="field-label" htmlFor="cpCur">Current password</label>
          <input id="cpCur" type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="cpA">New password</label>
          <input id="cpA" type="password" autoComplete="new-password" required placeholder="At least 6 characters" value={a} onChange={(e) => setA(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="cpB">Confirm new password</label>
          <input id="cpB" type="password" autoComplete="new-password" required value={b} onChange={(e) => setB(e.target.value)} />
        </div>
        {err && <div className="auth-error">{err}</div>}
        <div className="modal-actions" style={{ marginTop: 4 }}>
          <button className="btn-ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn-accent" type="submit">Change password</button>
        </div>
      </form>
    </Modal>
  );
}
