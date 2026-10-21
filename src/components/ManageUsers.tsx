import { useEffect, useState } from "react";
import { onSnapshot, query, where } from "firebase/firestore";
import { cols, approveRequest, denyRequest, removeMember, callResetPassword, callSetDisabled } from "../lib/data";
import { useSession, toast, type AccessRequest } from "../lib/store";
import { grantableRoles, roleIn, type Role } from "../domain/roles";
import { errMsg } from "../lib/util";
import { Modal, Sheet } from "./Overlay";

interface Member { id: string; projectId: string; userId: string; userName: string; role: Role }

export function ManageUsers({ pid, projectName, onClose }: { pid: string; projectName: string; onClose: () => void }) {
  const s = useSession();
  const [members, setMembers] = useState<Member[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [disabled, setDisabled] = useState<Record<string, true>>({});
  const [reqRole, setReqRole] = useState<Record<string, Role>>({});
  const [temp, setTemp] = useState<{ name: string; pw: string; sms: boolean } | null>(null);

  useEffect(() => {
    const err = (e: unknown) => console.error(e);
    const u1 = onSnapshot(query(cols.members, where("projectId", "==", pid)), (q) => setMembers(q.docs.map((d) => ({ id: d.id, ...d.data() }) as Member)), err);
    const u2 = onSnapshot(query(cols.requests, where("projectId", "==", pid)), (q) => setRequests(q.docs.map((d) => ({ id: d.id, ...d.data() }) as AccessRequest)), err);
    const u3 = onSnapshot(cols.disabled, (q) => setDisabled(Object.fromEntries(q.docs.map((d) => [d.id, true as const]))), err);
    return () => { u1(); u2(); u3(); };
  }, [pid]);

  const roles = grantableRoles(s);
  const mine = roleIn(s, pid);

  const reset = (m: Member) => {
    toast("Resetting password…");
    callResetPassword({ targetUid: m.userId, projectId: pid })
      .then((r) => setTemp({ name: m.userName, pw: r.data.tempPassword, sms: r.data.smsSent }))
      .catch((e) => toast(e?.message || "Couldn't reset that password."));
  };
  const toggle = (m: Member) => {
    const off = !!disabled[m.userId];
    const run = () => callSetDisabled({ targetUid: m.userId, projectId: pid, disabled: !off })
      .then(() => toast(off ? "Account re-enabled." : "Account disabled."))
      .catch((e) => toast(e?.message || "Couldn't update that account."));
    if (off) run();
    else s.confirm({ title: "Disable account", message: `${m.userName || "This user"} won't be able to sign in until an Admin or Supervisor re-enables their account.`, confirmText: "Disable account", danger: true, onConfirm: run });
  };

  return (
    <Sheet title={`Users — ${projectName}`} onClose={onClose}>
      <div style={{ padding: 16 }} id="manageUsersBody">
        {requests.length > 0 && (
          <>
            <h3>Pending requests</h3>
            <ul className="seals">
              {requests.map((r) => (
                <li className="member-row" key={r.id}>
                  <div className="member-main"><div className="member-name">{r.userName || "Unnamed"}</div><div className="member-sub">Requesting access</div></div>
                  <select className="role-select" aria-label={`Role for ${r.userName}`} value={reqRole[r.id] ?? "Contractor"}
                    onChange={(e) => setReqRole({ ...reqRole, [r.id]: e.target.value as Role })}>
                    {roles.filter((x) => x !== "Admin").map((x) => <option key={x}>{x}</option>)}
                  </select>
                  <button className="btn-accent btn-sm" onClick={() => approveRequest(r, reqRole[r.id] ?? "Contractor").catch((e) => toast("Couldn't approve: " + errMsg(e)))}>Approve</button>
                  <button className="seal-remove" aria-label={`Deny ${r.userName}`} onClick={() => denyRequest(r.id).catch(() => toast("Couldn't remove the request."))}>×</button>
                </li>
              ))}
            </ul>
          </>
        )}
        <h3>Members</h3>
        <ul className="seals">
          {members.length === 0 && <li className="empty-sm">No users added yet. Admins have access to every project.</li>}
          {members.map((m) => {
            const manageThis = s.isAdmin || mine === "Supervisor";
            const self = m.userId === s.uid;
            return (
              <li className="member-row" key={m.id}>
                <div className="member-main"><div className="member-name">{m.userName || m.userId}</div><div className="member-sub">{m.role === "Viewer" ? "View only" : m.role}{disabled[m.userId] ? " · Disabled" : ""}</div></div>
                {manageThis && !self && <button className="btn-ghost btn-sm" onClick={() => reset(m)}>Reset password</button>}
                {manageThis && !self && <button className="btn-ghost btn-sm" onClick={() => toggle(m)}>{disabled[m.userId] ? "Enable" : "Disable"}</button>}
                {manageThis && <button className="seal-remove" aria-label={`Remove ${m.userName}`} onClick={() => removeMember(m.id).catch(() => toast("Couldn't remove the user."))}>×</button>}
              </li>
            );
          })}
        </ul>
        <p className="project-id-sub" style={{ marginTop: 12 }}>To change someone's role, remove them and approve them again with the new role. Admin is a global role set in the admins list.</p>
      </div>
      {temp && (
        <Modal onClose={() => setTemp(null)} label="Password reset">
          <h3>Password reset</h3>
          <p>{temp.sms ? `Texted to ${temp.name || "this user"}. Temporary password (in case the text doesn't arrive):` : `Temporary password for ${temp.name || "this user"}. No mobile number on file, so relay this yourself:`}</p>
          <input className="mono" readOnly value={temp.pw} aria-label="Temporary password" style={{ textAlign: "center", fontSize: 16 }} onFocus={(e) => e.target.select()} />
          <p style={{ fontSize: 12 }}>They'll be asked to set their own new password the next time they sign in with this one.</p>
          <div className="modal-actions">
            <button className="btn-ghost" onClick={() => navigator.clipboard?.writeText(temp.pw).then(() => toast("Copied."), () => toast("Couldn't copy. Select and copy it manually."))}>Copy</button>
            <button className="btn-accent" onClick={() => setTemp(null)}>Done</button>
          </div>
        </Modal>
      )}
    </Sheet>
  );
}
