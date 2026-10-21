import { useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { ChangePasswordModal, ProfileModal } from "../screens/Auth";

function currentTheme(): string {
  return document.documentElement.getAttribute("data-theme") ?? "";
}

export function ThemeButton() {
  const [t, setT] = useState(currentTheme());
  const toggle = () => {
    const next = t === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("trackline_theme", next); } catch { /* ignore */ }
    setT(next);
  };
  return <button className="icon-btn" onClick={toggle} aria-label="Toggle theme" title="Toggle theme">{t === "dark" ? "☀" : "◐"}</button>;
}

export function AccountButtons() {
  const [open, setOpen] = useState<"profile" | "password" | null>(null);
  return (
    <>
      <button className="icon-btn" onClick={() => setOpen("profile")} aria-label="Edit profile" title="Edit profile">📱</button>
      <button className="icon-btn" onClick={() => setOpen("password")} aria-label="Change password" title="Change password">🔑</button>
      <button className="icon-btn" onClick={() => signOut(auth)} aria-label="Sign out" title="Sign out">⎋</button>
      {open === "profile" && <ProfileModal onClose={() => setOpen(null)} />}
      {open === "password" && <ChangePasswordModal onClose={() => setOpen(null)} />}
    </>
  );
}
