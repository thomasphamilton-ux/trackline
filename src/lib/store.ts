import { create } from "zustand";
import type { Role } from "../domain/roles";

export interface Project { id: string; name: string; createdAt: number }
export interface AccessRequest { id: string; projectId: string; userId: string; userName: string; requestedAt: number }

export interface ConfirmOpts { title: string; message?: string; confirmText?: string; danger?: boolean; onConfirm: () => void }
export interface PromptOpts { title: string; placeholder?: string; initialValue?: string; confirmText?: string; onConfirm: (v: string) => void }
type Dialog = ({ kind: "confirm" } & ConfirmOpts) | ({ kind: "prompt" } & PromptOpts);

interface Session {
  uid: string | null;
  name: string;
  phone: string;
  isAdmin: boolean;
  rolesByProject: Record<string, Role>;
  accessReady: boolean;
  projectsLoaded: boolean;
  projects: Project[];
  myRequests: AccessRequest[];
  mustChangePassword: boolean;
  currentProjectId: string | null;
  toast: { msg: string; id: number } | null;
  dialog: Dialog | null;
  set: (p: Partial<Session>) => void;
  showToast: (msg: string) => void;
  confirm: (o: ConfirmOpts) => void;
  prompt: (o: PromptOpts) => void;
  closeDialog: () => void;
  reset: () => void;
}

const initial = {
  uid: null, name: "", phone: "", isAdmin: false, rolesByProject: {}, accessReady: false,
  projectsLoaded: false, projects: [], myRequests: [], mustChangePassword: false,
  currentProjectId: null, toast: null, dialog: null,
};

export const useSession = create<Session>((set) => ({
  ...initial,
  set: (p) => set(p),
  showToast: (msg) => set({ toast: { msg, id: Date.now() } }),
  confirm: (o) => set({ dialog: { kind: "confirm", ...o } }),
  prompt: (o) => set({ dialog: { kind: "prompt", ...o } }),
  closeDialog: () => set({ dialog: null }),
  reset: () => set({ ...initial }),
}));

export const toast = (msg: string) => useSession.getState().showToast(msg);
export const access = () => {
  const s = useSession.getState();
  return { isAdmin: s.isAdmin, rolesByProject: s.rolesByProject };
};
