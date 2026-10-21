import { useEffect, useMemo, useState } from "react";
import type { Asset } from "../domain/equipment";
import { EQUIPMENT_TYPES } from "../domain/equipment";
import { DEFAULT_SEQUENCE, nextStage, notStarted } from "../domain/stages";
import { can, roleIn } from "../domain/roles";
import { exportRows, toCsv } from "../domain/csv";
import { useSession, toast } from "../lib/store";
import { createAsset, deleteProject, renameProject, subscribeAssets } from "../lib/data";
import { download, errMsg } from "../lib/util";
import { AssetDetail, addSeal, codeBelongsTo, linkCode, statusText } from "../components/AssetDetail";
import { Scanner, type ScanType } from "../components/Scanner";
import { GenerateModal, ImportModal, NewAssetModal } from "../components/ProjectModals";
import { ManageUsers } from "../components/ManageUsers";
import { ThemeButton } from "../components/TopActions";

const PAGE = 150;
type Modal = "new" | "import" | "generate" | "users" | null;

export function Dashboard({ pid }: { pid: string }) {
  const s = useSession();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [stage, setStage] = useState("all");
  const [type, setType] = useState("top");
  const [hall, setHall] = useState("");
  const [side, setSide] = useState("");
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [detail, setDetail] = useState<string | null>(null);
  const [scan, setScan] = useState<{ type: ScanType; assetId?: string } | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [menu, setMenu] = useState(false);

  useEffect(() => subscribeAssets(pid, (list, p) => { setAssets(list); setPending(p); setLoaded(true); },
    (e) => { console.error(e); toast("Couldn't load this project's assets."); }), [pid]);
  useEffect(() => setShown(PAGE), [stage, type, hall, side, search]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!(e.target as Element).closest?.(".menu-wrap")) setMenu(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  const byId = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const name = pid === "" ? "Unassigned" : s.projects.find((p) => p.id === pid)?.name ?? pid;
  const role = roleIn(s, pid);
  const uid = s.uid!;

  const scoped = useMemo(() => assets.filter((a) =>
    (type === "all" || (type === "top" ? a.equipmentType !== "Opti Component" : a.equipmentType === type)) &&
    (!hall || a.hall === hall) && (!side || a.side === side)), [assets, type, hall, side]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scoped.filter((a) => {
      if (stage === "complete" && nextStage(a.stages) !== null) return false;
      if (stage === "turnover" && !a.turnoverAt) return false;
      if (stage === "not-started" && !notStarted(a.stages)) return false;
      if (!["all", "complete", "turnover", "not-started"].includes(stage) && nextStage(a.stages) !== stage) return false;
      if (!q) return true;
      return [a.id, a.code, a.label, a.location, a.level, a.optiNum, a.equipmentType, ...a.altCodes].some((v) => v.toLowerCase().includes(q));
    });
  }, [scoped, stage, search]);

  const stats = useMemo(() => {
    const per = DEFAULT_SEQUENCE.map((d) => scoped.filter((a) => a.stages[d.name]?.done).length);
    return { total: scoped.length, per, energized: per[per.length - 1], turned: scoped.filter((a) => a.turnoverAt).length };
  }, [scoped]);

  const handleCode = (code: string) => {
    const hit = assets.find((a) => codeBelongsTo(a, code));
    if (hit) return setDetail(hit.id);
    if (!can.createAssets(s, pid)) return toast("This code isn't assigned yet. Ask a Supervisor or Admin to add it.");
    s.confirm({
      title: "New code scanned", message: `This code isn't assigned to an asset yet:\n${code}\n\nAssign it to ${name}?`, confirmText: "Assign asset",
      onConfirm: () => createAsset(pid, code.replace(/[^A-Za-z0-9_\-.~:@+]/g, "-").slice(0, 180), code, {}, uid)
        .then((a) => setDetail(a.id)).catch((e) => toast("Couldn't create the asset: " + errMsg(e))),
    });
  };
  const onScan = (code: string) => {
    const ctx = scan;
    setScan(null);
    if (!code || !ctx) return;
    const target = ctx.assetId ? byId.get(ctx.assetId) : undefined;
    if (ctx.type === "seal" && target) addSeal(pid, target, code, uid);
    else if (ctx.type === "link" && target) linkCode(pid, target, assets, code, uid);
    else handleCode(code);
  };

  const exportCsv = () => {
    const fname = (pid === "" ? "unassigned" : pid).replace(/[:@]/g, "-") + "-assets.csv";
    download(fname, toCsv(exportRows(visible)), "text/csv");
  };

  const filters = [
    { key: "all", label: "All" }, { key: "not-started", label: "Not started" },
    ...DEFAULT_SEQUENCE.map((d) => ({ key: d.name, label: "Next: " + d.name })),
    { key: "complete", label: "Energized" }, { key: "turnover", label: "Turned over" },
  ];

  return (
    <div className="screen">
      <header className="topbar">
        <div className="topbar-row">
          <div className="brand">
            <div className="brand-name-row">
              <button className="icon-btn" onClick={() => s.set({ currentProjectId: null })} aria-label="Back to projects" title="Back to projects">‹</button>
              <div>
                <div className="brand-name">{name}</div>
                <div className="project-id-sub">{pid}</div>
              </div>
            </div>
            <div className="brand-sub">
              <span className="mode-dot" style={{ background: pending ? "var(--accent)" : "var(--good)" }} />
              <span>{pending ? "Syncing changes…" : "Synced"}</span>
              <span>{role ? ` · ${role === "Viewer" ? "View only" : role}` : ""}</span>
            </div>
          </div>
          <div className="topbar-actions">
            {can.manageUsers(s, pid) && pid !== "" && <button className="icon-btn" onClick={() => setModal("users")} aria-label="Manage users" title="Manage users">👥</button>}
            <ThemeButton />
            <div className="menu-wrap">
              <button className="icon-btn" aria-label="More actions" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>⋯</button>
              {menu && (
                <div className="menu" role="menu" onClick={() => setMenu(false)}>
                  {can.createAssets(s, pid) && <button role="menuitem" onClick={() => setModal("import")}>Import CSV</button>}
                  <button role="menuitem" onClick={exportCsv}>Export listed assets (CSV)</button>
                  {can.manageProject(s, pid) && pid !== "" && <>
                    <button role="menuitem" onClick={() => s.prompt({
                      title: "Rename project", placeholder: name, initialValue: name, confirmText: "Save",
                      onConfirm: (v) => renameProject(pid, v).catch((e) => toast("Couldn't rename: " + errMsg(e))),
                    })}>Rename project</button>
                    <button role="menuitem" className="danger" onClick={() => s.confirm({
                      title: "Delete project", message: `Assets in "${name}" will move to Unassigned. The project record will be removed. This can't be undone.`,
                      confirmText: "Delete project", danger: true,
                      onConfirm: () => { s.set({ currentProjectId: null }); deleteProject(pid, uid).catch((e) => toast("Couldn't delete: " + errMsg(e))); },
                    })}>Delete project</button>
                  </>}
                </div>
              )}
            </div>
          </div>
        </div>
        {stats.total > 0 && (
          <div className="stats-row">
            <div className="stat stat-total"><span className="stat-n">{stats.total}</span><span className="stat-l">Assets</span></div>
            {DEFAULT_SEQUENCE.map((d, i) => <div className="stat" key={d.name}><span className="stat-n">{stats.per[i]}</span><span className="stat-l">{d.name}</span></div>)}
            <div className="stat stat-good"><span className="stat-n">{stats.energized}</span><span className="stat-l">Energized</span></div>
            <div className="stat"><span className="stat-n">{stats.turned}</span><span className="stat-l">Turned over</span></div>
          </div>
        )}
        <div className="search-row">
          <input className="search-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ID, label, location or OPTI #" aria-label="Search assets" />
        </div>
        <div className="select-row">
          <select className="select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Equipment type">
            <option value="top">All equipment (hide Opti components)</option>
            <option value="all">Everything, incl. components</option>
            {EQUIPMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="select" value={hall} onChange={(e) => setHall(e.target.value)} aria-label="Hall">
            <option value="">All halls</option><option value="A">Hall A</option><option value="B">Hall B</option><option value="C">Hall C</option><option value="Admin">Admin</option>
          </select>
          <select className="select" value={side} onChange={(e) => setSide(e.target.value)} aria-label="Side">
            <option value="">Both sides</option><option>West</option><option>East</option>
          </select>
        </div>
        <div className="filter-bar" role="group" aria-label="Filter by stage">
          {filters.map((f) => <button key={f.key} className={"chip" + (stage === f.key ? " active" : "")} aria-pressed={stage === f.key} onClick={() => setStage(f.key)}>{f.label}</button>)}
        </div>
      </header>

      <main>
        <div className="asset-list">
          {!loaded ? <div className="empty">Loading assets…</div> :
            assets.length === 0 ? (
              <div className="empty-state">
                <div className="empty-title">No assets yet</div>
                <div className="empty-sub">Scan a QR code already on an asset, create one, import a CSV, or generate a hall's equipment.</div>
              </div>
            ) : visible.length === 0 ? <div className="empty">No assets match your search or filters.</div> :
              <>
                {visible.slice(0, shown).map((a) => <AssetRow key={a.id} a={a} onOpen={() => setDetail(a.id)} />)}
                {visible.length > shown && (
                  <button className="btn-ghost more-btn" onClick={() => setShown(shown + PAGE)}>Show more ({visible.length - shown} left)</button>
                )}
              </>}
        </div>
      </main>

      <div className="dock">
        <div className="dock-inner">
          {can.createAssets(s, pid) && <button className="btn-ghost" onClick={() => setModal("new")}>+ New asset</button>}
          {can.createAssets(s, pid) && pid !== "" && <button className="btn-ghost" onClick={() => setModal("generate")}>Generate hall</button>}
          <button className="btn-accent" onClick={() => setScan({ type: "add" })}>Scan QR</button>
        </div>
      </div>

      {detail !== null && (
        <AssetDetail pid={pid} asset={byId.get(detail)} byId={byId} all={assets} onClose={() => setDetail(null)}
          onOpen={setDetail} onScan={(t) => setScan({ type: t, assetId: detail })} />
      )}
      {scan && <Scanner type={scan.type} onResult={onScan} onClose={() => setScan(null)} />}
      {modal === "new" && <NewAssetModal pid={pid} existing={byId} onClose={() => setModal(null)} onCreated={setDetail} />}
      {modal === "import" && <ImportModal pid={pid} existing={byId} onClose={() => setModal(null)} />}
      {modal === "generate" && <GenerateModal pid={pid} existing={byId} onClose={() => setModal(null)} />}
      {modal === "users" && <ManageUsers pid={pid} projectName={name} onClose={() => setModal(null)} />}
    </div>
  );
}

function AssetRow({ a, onOpen }: { a: Asset; onOpen: () => void }) {
  const next = nextStage(a.stages);
  const tags = [a.hall && (a.hall === "Admin" ? "Admin" : "Hall " + a.hall), a.side, a.location, a.level && "Lvl " + a.level, a.optiNum && "OPTI " + a.optiNum].filter(Boolean) as string[];
  return (
    <button className={"row" + (next ? "" : " row-complete")} onClick={onOpen}>
      <div className="row-main">
        <div className="row-type">{a.equipmentType}</div>
        <div className="row-id">{a.id}</div>
        <div className="row-label">{a.label || "Unlabeled asset"}</div>
        {(tags.length > 0 || a.turnoverAt) && (
          <div className="row-tags">
            {tags.map((t) => <span className="tag-pill" key={t}>{t}</span>)}
            {a.turnoverAt && <span className="tag-pill turnover">Turned over</span>}
          </div>
        )}
      </div>
      <div className="row-meta">
        <div className="dots" aria-hidden="true">{DEFAULT_SEQUENCE.map((d) => <span key={d.name} className={"dot" + (a.stages[d.name]?.done ? " done" : "")} />)}</div>
        <div className={"row-status" + (next ? "" : " good")}>{statusText(a)}</div>
        <div className="row-seals">{a.seals.length} {a.seals.length === 1 ? "seal" : "seals"}</div>
      </div>
    </button>
  );
}

