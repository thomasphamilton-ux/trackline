import {
  collection, doc, getCountFromServer, getDocs, onSnapshot, query, setDoc, updateDoc, deleteDoc,
  where, writeBatch, orderBy, limit, type Unsubscribe, type DocumentData,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";
import { useSession, type AccessRequest, type Project } from "./store";
import { normalizeAsset, newAsset, type Asset, type AssetFields } from "../domain/equipment";
import { nextStage, type Stages } from "../domain/stages";
import type { Role } from "../domain/roles";
import type { Draft } from "../domain/generator";

export const cols = {
  projects: collection(db, "projects"),
  members: collection(db, "members"),
  requests: collection(db, "accessRequests"),
  admins: collection(db, "admins"),
  mustChange: collection(db, "mustChangePassword"),
  users: collection(db, "users"),
  disabled: collection(db, "disabledAccounts"),
};
/** "" is the Admin-only Unassigned bucket. */
export const assetsCol = (pid: string) => collection(db, "projects", pid === "" ? "_unassigned" : pid, "assets");

/** Next stage name, or "Complete". Stored on every asset so project totals can be counted cheaply. */
export const progressOf = (stages: Stages) => nextStage(stages) ?? "Complete";

// ---------- session ----------
export function subscribeSession(uid: string, onDisabled: () => void): Unsubscribe {
  const set = useSession.getState().set;
  const unsubs: Unsubscribe[] = [];
  const err = (e: unknown) => console.error(e);
  unsubs.push(onSnapshot(doc(cols.mustChange, uid), (d) => set({ mustChangePassword: d.exists() }), err));
  unsubs.push(onSnapshot(doc(cols.disabled, uid), (d) => { if (d.exists()) onDisabled(); }, err));
  unsubs.push(onSnapshot(doc(cols.users, uid), (d) => set({ phone: d.exists() ? String(d.data().phone ?? "") : "" }), err));
  unsubs.push(onSnapshot(doc(cols.admins, uid),
    (d) => set({ isAdmin: d.exists(), accessReady: true }),
    (e) => { err(e); set({ accessReady: true }); }));
  unsubs.push(onSnapshot(query(cols.members, where("userId", "==", uid)), (snap) => {
    const roles: Record<string, Role> = {};
    snap.docs.forEach((d) => { const m = d.data(); if (m.projectId) roles[m.projectId] = m.role; });
    set({ rolesByProject: roles });
  }, err));
  unsubs.push(onSnapshot(query(cols.requests, where("userId", "==", uid)), (snap) => {
    set({ myRequests: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AccessRequest) });
  }, err));
  unsubs.push(onSnapshot(query(cols.projects, orderBy("createdAt", "desc"), limit(200)), (snap) => {
    const projects: Project[] = snap.docs.map((d) => ({
      id: d.id, name: String(d.data().name ?? d.id), createdAt: Number(d.data().createdAt ?? 0),
    }));
    set({ projects, projectsLoaded: true });
  }, err));
  return () => unsubs.forEach((u) => u());
}

// ---------- assets ----------
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
/** Sorts IDs the way people read them: OPT-2B before OPT-10B. */
export const byIdNatural = (a: string, b: string) => collator.compare(a, b);
const TYPE_RANK: Record<string, number> = { Opti: 0, "Opti Component": 1, "Mech Panel": 2, "Fan Wall": 3, "COD Board": 4, RPP: 5, Other: 6 };
/** Groups each Opti's chain together: Opti, components, mech panel, fan walls, COD board, RPPs. */
export function assetOrder(a: Asset, b: Asset) {
  if (!!a.optiNum !== !!b.optiNum) return a.optiNum ? -1 : 1;
  return collator.compare(a.optiNum, b.optiNum)
    || (TYPE_RANK[a.equipmentType] ?? 9) - (TYPE_RANK[b.equipmentType] ?? 9)
    || byIdNatural(a.id, b.id);
}

export function subscribeAssets(pid: string, cb: (a: Asset[], pending: boolean) => void, onErr: (e: unknown) => void): Unsubscribe {
  return onSnapshot(assetsCol(pid), { includeMetadataChanges: true }, (snap) => {
    const list = snap.docs.map((d) => normalizeAsset(d.data(), d.id));
    list.sort(assetOrder);
    cb(list, snap.metadata.hasPendingWrites);
  }, onErr);
}

/** Writes only the changed fields, stamped with who and when (the rules check updatedBy). */
export function patchAsset(pid: string, id: string, patch: Partial<Asset>, uid: string) {
  const data: DocumentData = { ...patch, updatedAt: Date.now(), updatedBy: uid };
  if (patch.stages) data.progress = progressOf(patch.stages);
  return updateDoc(doc(assetsCol(pid), id), data);
}

function assetDoc(a: Asset, uid: string) {
  return { ...a, progress: progressOf(a.stages), updatedAt: Date.now(), updatedBy: uid };
}

export function createAsset(pid: string, id: string, code: string, fields: AssetFields, uid: string) {
  const a = newAsset(id, code, pid, fields);
  return setDoc(doc(assetsCol(pid), id), assetDoc(a, uid)).then(() => a);
}

/**
 * Creates many assets in batches of 400. IDs already in `existing` are skipped
 * (or, with `update`, have their non-empty fields updated instead).
 */
export async function writeMany(pid: string, rows: Draft[], existing: Map<string, Asset>, uid: string, update = false) {
  let created = 0, updated = 0, skipped = 0;
  let batch = writeBatch(db);
  let n = 0;
  const flush = async () => { if (n) { await batch.commit(); batch = writeBatch(db); n = 0; } };
  for (const r of rows) {
    const cur = existing.get(r.id);
    if (cur) {
      if (!update) { skipped++; continue; }
      const patch = Object.fromEntries(Object.entries(r.fields).filter(([, v]) => (Array.isArray(v) ? v.length : v)));
      if (!Object.keys(patch).length) { skipped++; continue; }
      batch.update(doc(assetsCol(pid), r.id), { ...patch, updatedAt: Date.now(), updatedBy: uid });
      updated++;
    } else {
      batch.set(doc(assetsCol(pid), r.id), assetDoc(newAsset(r.id, r.id, pid, r.fields), uid));
      created++;
    }
    if (++n >= 400) await flush();
  }
  await flush();
  return { created, updated, skipped };
}

export const deleteAsset = (pid: string, id: string) => deleteDoc(doc(assetsCol(pid), id));

// ---------- projects ----------
export const createProject = (p: Project) => setDoc(doc(cols.projects, p.id), p);
export const renameProject = (id: string, name: string) => updateDoc(doc(cols.projects, id), { name });

/** Moves the project's assets to Unassigned, then removes the project record (legacy behavior). */
export async function deleteProject(pid: string, uid: string) {
  const snap = await getDocs(assetsCol(pid));
  let batch = writeBatch(db);
  let n = 0;
  for (const d of snap.docs) {
    batch.set(doc(assetsCol(""), d.id), { ...d.data(), projectId: "", updatedAt: Date.now(), updatedBy: uid });
    batch.delete(d.ref);
    if ((n += 2) >= 400) { await batch.commit(); batch = writeBatch(db); n = 0; }
  }
  if (n) await batch.commit();
  await deleteDoc(doc(cols.projects, pid));
}

export async function projectStats(pid: string) {
  const all = await getCountFromServer(assetsCol(pid));
  const done = await getCountFromServer(query(assetsCol(pid), where("progress", "==", "Complete")));
  return { count: all.data().count, complete: done.data().count };
}

// ---------- membership ----------
export const requestAccess = (pid: string, uid: string, name: string) =>
  setDoc(doc(cols.requests, `${pid}_${uid}`), { projectId: pid, userId: uid, userName: name || "Unnamed", requestedAt: Date.now() });

export async function approveRequest(r: AccessRequest, role: Role) {
  await setDoc(doc(cols.members, r.id), { projectId: r.projectId, userId: r.userId, userName: r.userName || "Unnamed", role, addedAt: Date.now() });
  await deleteDoc(doc(cols.requests, r.id));
}
export const denyRequest = (id: string) => deleteDoc(doc(cols.requests, id));
export const removeMember = (id: string) => deleteDoc(doc(cols.members, id));

export const callResetPassword = httpsCallable<{ targetUid: string; projectId: string }, { tempPassword: string; smsSent: boolean }>(functions, "resetUserPassword");
export const callSetDisabled = httpsCallable<{ targetUid: string; projectId: string; disabled: boolean }, { disabled: boolean }>(functions, "setAccountDisabled");
