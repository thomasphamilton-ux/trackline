import { useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./lib/firebase";
import { subscribeSession } from "./lib/data";
import { useSession, toast } from "./lib/store";
import { can } from "./domain/roles";
import { AuthScreen, ForcePasswordScreen } from "./screens/Auth";
import { ProjectsScreen } from "./screens/Projects";
import { Dashboard } from "./screens/Dashboard";
import { Dialogs, Toast } from "./components/Dialogs";

const LAST = "trackline_last_project";

export function App() {
  const s = useSession();

  useEffect(() => {
    let unsub: (() => void) | null = null;
    const off = onAuthStateChanged(auth, (user) => {
      unsub?.();
      unsub = null;
      useSession.getState().reset();
      if (!user) return;
      useSession.getState().set({
        uid: user.uid,
        name: user.displayName || (user.email ?? "").split("@")[0] || "Unnamed",
      });
      unsub = subscribeSession(user.uid, () => { toast("Your account has been disabled."); signOut(auth); });
    });
    return () => { off(); unsub?.(); };
  }, []);

  // Reopen the last project once access is known (legacy behavior).
  useEffect(() => {
    if (!s.accessReady || !s.projectsLoaded || s.currentProjectId !== null) return;
    let last: string | null = null;
    try { last = localStorage.getItem(LAST); } catch { /* storage unavailable */ }
    if (last !== null && can.openProject(s, last)) s.set({ currentProjectId: last });
    // Only on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.accessReady, s.projectsLoaded]);

  useEffect(() => {
    try {
      if (s.currentProjectId === null) localStorage.removeItem(LAST);
      else localStorage.setItem(LAST, s.currentProjectId);
    } catch { /* storage unavailable */ }
  }, [s.currentProjectId]);

  let screen;
  if (!s.uid) screen = <AuthScreen />;
  else if (s.mustChangePassword) screen = <ForcePasswordScreen />;
  else if (!s.accessReady || !s.projectsLoaded) screen = <div className="screen"><div className="empty">Checking your access…</div></div>;
  else if (s.currentProjectId !== null && can.openProject(s, s.currentProjectId)) screen = <Dashboard key={s.currentProjectId} pid={s.currentProjectId} />;
  else screen = <ProjectsScreen />;

  return (
    <>
      {screen}
      <Dialogs />
      <Toast />
    </>
  );
}
