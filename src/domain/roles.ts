import { DEFAULT_SEQUENCE, type StageDef } from "./stages";

/** Viewer is the new view-only role, built now for future use. */
export type Role = "Admin" | "Supervisor" | "Contractor" | "Viewer";
export const ROLES: Role[] = ["Contractor", "Supervisor", "Admin", "Viewer"];

export interface Access { isAdmin: boolean; rolesByProject: Record<string, Role> }

export function roleIn(a: Access, pid: string): Role | null {
  if (a.isAdmin) return "Admin";
  return a.rolesByProject[pid] ?? null;
}
const lead = (r: Role | null) => r === "Admin" || r === "Supervisor";

export const can = {
  openProject: (a: Access, pid: string) => roleIn(a, pid) !== null,
  createAssets: (a: Access, pid: string) => lead(roleIn(a, pid)),
  deleteAssets: (a: Access, pid: string) => lead(roleIn(a, pid)),
  /** Labels, location, seal notes. Viewers can't edit anything. */
  editAssets: (a: Access, pid: string) => { const r = roleIn(a, pid); return r !== null && r !== "Viewer"; },
  manageUsers: (a: Access, pid: string) => lead(roleIn(a, pid)),
  manageIdentifiers: (a: Access, pid: string) => lead(roleIn(a, pid)),
  manageProject: (a: Access, pid: string) => roleIn(a, pid) === "Admin",
  editStage(a: Access, pid: string, stage: string, seq: StageDef[] = DEFAULT_SEQUENCE) {
    const r = roleIn(a, pid);
    if (r === null || r === "Viewer") return false;
    if (seq.find((d) => d.name === stage)?.restricted) return lead(r);
    return true;
  },
};

/** Roles a user may grant: Supervisors can't create Admins. */
export function grantableRoles(a: Access): Role[] {
  return a.isAdmin ? ["Contractor", "Supervisor", "Admin", "Viewer"] : ["Contractor", "Supervisor", "Viewer"];
}
