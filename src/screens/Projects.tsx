import { useEffect, useMemo, useState } from "react";
import { useSession, toast } from "../lib/store";
import { createProject, projectStats, requestAccess } from "../lib/data";
import { sanitizeId, genProjectId } from "../domain/ids";
import { errMsg } from "../lib/util";
import { Modal } from "../components/Overlay";
import { AccountButtons, ThemeButton } from "../components/TopActions";

type Stat = { count: number; complete: number };

export function ProjectsScreen() {
  const s = useSession();
  const [stats, setStats] = useState<Record<string, Stat>>({});
  const [creating, setCreating] = useState(false);

  const visible = useMemo(() => {
    const list = [...s.projects].sort((a, b) => a.name.localeCompare(b.name));
    if (s.isAdmin) return [...list.map((p) => ({ ...p, special: false })), { id: "", name: "Unassigned", createdAt: 0, special: true }];
    return list.filter((p) => s.rolesByProject[p.id]).map((p) => ({ ...p, special: false }));
  }, [s.projects, s.isAdmin, s.rolesByProject]);

  useEffect(() => {
    let live = true;
    Promise.all(visible.map((p) => projectStats(p.id).then((r) => [p.id, r] as const).catch(() => [p.id, { count: 0, complete: 0 }] as const)))
      .then((pairs) => { if (live) setStats(Object.fromEntries(pairs)); });
    return () => { live = false; };
  }, [visible]);

  const noAccess = !s.isAdmin && Object.keys(s.rolesByProject).length === 0;

  return (
    <div className="screen">
      <header className="topbar">
        <div className="topbar-row">
          <div className="brand">
            <div className="brand-name">Trackline</div>
            <div className="project-id-sub">Signed in as {s.name}</div>
          </div>
          <div className="topbar-actions">
            <AccountButtons />
            <ThemeButton />
          </div>
        </div>
      </header>
      <main>
        {noAccess ? (
          s.projects.length === 0 ? (
            <div className="empty-state"><div className="empty-title">No projects yet</div><div className="empty-sub">Ask an Admin to create a project and add you to it.</div></div>
          ) : (
            <div className="asset-list">
              <div className="empty-sub" style={{ padding: "12px 4px" }}>You don't have access to any project yet. Request access below.</div>
              {[...s.projects].sort((a, b) => a.name.localeCompare(b.name)).map((p) => {
                const sent = s.myRequests.some((r) => r.projectId === p.id);
                return (
                  <div className="project-row" key={p.id}>
                    <div className="project-main"><div className="project-name">{p.name}</div><div className="project-id">{p.id}</div></div>
                    {sent ? <span className="chip">Requested</span> : (
                      <button className="btn-ghost" onClick={() => requestAccess(p.id, s.uid!, s.name).then(() => toast("Request sent.")).catch((e) => toast("Couldn't send the request: " + errMsg(e)))}>Request access</button>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : visible.length === 0 || (visible.length === 1 && visible[0].special) ? (
          <div className="empty-state"><div className="empty-title">No projects yet</div><div className="empty-sub">Create a project to start tracking its equipment.</div></div>
        ) : (
          <div className="asset-list">
            {visible.map((p) => {
              const st = stats[p.id] ?? { count: 0, complete: 0 };
              const pct = st.count ? Math.round((st.complete / st.count) * 100) : 0;
              return (
                <button key={p.id || "_unassigned"} className={"project-row" + (p.special ? " unassigned" : "")} onClick={() => s.set({ currentProjectId: p.id })}>
                  <div className="project-main">
                    <div className="project-name">{p.name}</div>
                    {!p.special && <div className="project-id">{p.id}</div>}
                    <div className="project-sub">{st.count} {st.count === 1 ? "asset" : "assets"}</div>
                  </div>
                  <div className="project-meta">
                    <div className={"project-pct" + (st.count && pct === 100 ? " good" : "")}>{st.count ? pct + "%" : "—"}</div>
                    <div className="project-bar-track"><div className="project-bar-fill" style={{ width: pct + "%" }} /></div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
      {s.isAdmin && (
        <div className="dock"><div className="dock-inner"><button className="btn-accent" onClick={() => setCreating(true)}>+ New project</button></div></div>
      )}
      {creating && <NewProjectModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewProjectModal({ onClose }: { onClose: () => void }) {
  const s = useSession();
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [touched, setTouched] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return toast("Give the project a name.");
    const pid = sanitizeId(id) || sanitizeId(n) || genProjectId();
    if (pid === "_unassigned" || s.projects.some((p) => p.id === pid)) return toast("A project with that ID already exists.");
    try {
      await createProject({ id: pid, name: n, createdAt: Date.now() });
      onClose();
      s.set({ currentProjectId: pid });
    } catch (e2) { toast("Couldn't create the project: " + errMsg(e2)); }
  };
  return (
    <Modal onClose={onClose} wide label="New project">
      <h3>New project</h3>
      <form onSubmit={submit}>
        <div className="field-group">
          <div>
            <label className="field-label" htmlFor="npName">Project name</label>
            <input id="npName" autoFocus autoComplete="off" placeholder="e.g. Dalton 4" value={name}
              onChange={(e) => { setName(e.target.value); if (!touched) setId(sanitizeId(e.target.value)); }} />
          </div>
          <div>
            <label className="field-label" htmlFor="npId">Project ID</label>
            <input id="npId" autoComplete="off" placeholder="Auto-generated from the name" value={id} onChange={(e) => { setId(e.target.value); setTouched(true); }} />
          </div>
        </div>
        <div className="modal-actions" style={{ marginTop: 14 }}>
          <button className="btn-ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn-accent" type="submit">Create project</button>
        </div>
      </form>
    </Modal>
  );
}
