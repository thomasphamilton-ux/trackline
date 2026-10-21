import { useMemo, useState } from "react";
import type { Asset, AssetFields } from "../domain/equipment";
import { EQUIPMENT_TYPES } from "../domain/equipment";
import { genAssetId, sanitizeId } from "../domain/ids";
import { planHall, countByType, type HallPlan } from "../domain/generator";
import { IMPORT_COLUMNS, IMPORT_SAMPLE, readImport, toCsv } from "../domain/csv";
import { createAsset, writeMany } from "../lib/data";
import { toast, useSession } from "../lib/store";
import { download, errMsg } from "../lib/util";
import { Modal } from "./Overlay";
import { Qr } from "./Qr";

export function NewAssetModal({ pid, existing, onClose, onCreated }: { pid: string; existing: Map<string, Asset>; onClose: () => void; onCreated: (id: string) => void }) {
  const uid = useSession((s) => s.uid)!;
  const [suggest] = useState(genAssetId);
  const [id, setId] = useState(suggest);
  const [f, setF] = useState<AssetFields>({ equipmentType: "Other", hall: "", side: "", location: "", level: "", optiNum: "" });
  const finalId = sanitizeId(id) || suggest;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (existing.has(finalId)) return toast("That asset ID is already in use. Try another.");
    try {
      await createAsset(pid, finalId, id.trim() || finalId, f, uid);
      onClose();
      onCreated(finalId);
    } catch (e2) { toast("Couldn't create the asset: " + errMsg(e2)); }
  };
  const set = (k: keyof AssetFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal onClose={onClose} wide label="New asset">
      <h3>New asset</h3>
      <form onSubmit={submit}>
        <div className="field-group">
          <div>
            <label className="field-label" htmlFor="naId">Asset ID</label>
            <input id="naId" autoFocus autoComplete="off" value={id} onChange={(e) => setId(e.target.value)} placeholder="Custom ID, or leave the generated one" />
          </div>
          <div className="field-grid">
            <div>
              <label className="field-label" htmlFor="naType">Type</label>
              <select id="naType" value={f.equipmentType} onChange={set("equipmentType")}>{EQUIPMENT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
            </div>
            <div>
              <label className="field-label" htmlFor="naHall">Hall</label>
              <select id="naHall" value={f.hall} onChange={set("hall")}>
                <option value="">None</option><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="Admin">Admin (house)</option>
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="naLoc">Location</label>
              <input id="naLoc" className="field-input" autoComplete="off" value={f.location} onChange={set("location")} placeholder="Location" />
            </div>
            <div>
              <label className="field-label" htmlFor="naLvl">Level</label>
              <input id="naLvl" className="field-input" autoComplete="off" value={f.level} onChange={set("level")} placeholder="Level" />
            </div>
            <div>
              <label className="field-label" htmlFor="naOpti">OPTI #</label>
              <input id="naOpti" className="field-input" autoComplete="off" value={f.optiNum} onChange={set("optiNum")} placeholder="OPTI #" />
            </div>
            <div>
              <label className="field-label" htmlFor="naSide">Side</label>
              <select id="naSide" value={f.side} onChange={set("side")}><option value="">None</option><option>West</option><option>East</option></select>
            </div>
          </div>
          <div className="new-asset-qr-wrap">
            <Qr text={finalId} size={140} small />
            <div className="new-asset-qr-hint">QR preview, created with the asset and ready to print.</div>
          </div>
        </div>
        <div className="modal-actions" style={{ marginTop: 14 }}>
          <button className="btn-ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn-accent" type="submit">Create asset</button>
        </div>
      </form>
    </Modal>
  );
}

export function ImportModal({ pid, existing, onClose }: { pid: string; existing: Map<string, Asset>; onClose: () => void }) {
  const uid = useSession((s) => s.uid)!;
  const [busy, setBusy] = useState(false);
  const run = async (file: File) => {
    setBusy(true);
    try {
      const r = readImport(await file.text());
      if (r.error) { toast(r.error); return; }
      const rows = r.rows.map((x) => ({ id: sanitizeId(x.rawId), fields: x.fields })).filter((x) => x.id);
      const res = await writeMany(pid, rows, existing, uid, true);
      const skipped = r.skipped + res.skipped;
      toast(`Imported ${res.created} new, updated ${res.updated}${skipped ? `, skipped ${skipped}` : ""}.`);
      onClose();
    } catch (e) { console.error(e); toast("Import failed: " + errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Modal onClose={onClose} wide label="Import assets">
      <h3>Import assets</h3>
      <p>Upload a CSV to add or update equipment. Columns: <strong>Asset ID</strong> (required), Type, Hall, Side, Location, Level, OPTI#, Parent, Fed By, Label. Existing IDs get their filled-in values updated; blank cells are left alone.</p>
      <div className="modal-actions">
        <button className="btn-ghost" type="button" onClick={() => download("trackline-import-template.csv", toCsv([IMPORT_COLUMNS, IMPORT_SAMPLE]), "text/csv")}>Download template</button>
        <label className={"btn-accent"} style={{ display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: busy ? 0.5 : 1 }}>
          {busy ? "Importing…" : "Choose CSV file"}
          <input type="file" accept=".csv,text/csv" hidden disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) run(f); }} />
        </label>
      </div>
      <div className="modal-actions"><button className="btn-ghost" type="button" onClick={onClose}>Cancel</button></div>
    </Modal>
  );
}

export function GenerateModal({ pid, existing, onClose }: { pid: string; existing: Map<string, Asset>; onClose: () => void }) {
  const uid = useSession((s) => s.uid)!;
  const [p, setP] = useState<HallPlan>({ hall: "B", from: 1, to: 26, components: true, gallery: true, rpps: true, rppsPerCod: 5 });
  const [busy, setBusy] = useState(false);
  const drafts = useMemo(() => planHall(p), [p]);
  const counts = countByType(drafts);
  const liveAlready = drafts.filter((d) => existing.has(d.id)).length;
  // Freeze the preview while creating, so it doesn't count its own new records as "already exist".
  const [frozen, setFrozen] = useState<number | null>(null);
  const already = frozen ?? liveAlready;
  const num = (k: "from" | "to") => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: Math.max(1, Math.min(26, Number(e.target.value) || 1)) });
  const flag = (k: "components" | "gallery" | "rpps") => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: e.target.checked });
  const go = async () => {
    setFrozen(liveAlready);
    setBusy(true);
    try {
      const r = await writeMany(pid, drafts, existing, uid, false);
      toast(`Created ${r.created} records${r.skipped ? `, skipped ${r.skipped} that already exist` : ""}.`);
      onClose();
    } catch (e) { toast("Couldn't create the equipment: " + errMsg(e)); setFrozen(null); } finally { setBusy(false); }
  };
  return (
    <Modal onClose={onClose} wide label="Generate hall equipment">
      <h3>Generate hall equipment</h3>
      <p>Creates each Opti with its components, plus its mech panel, fan walls, COD board and RPPs, already linked to what feeds them.</p>
      <div className="gen-grid">
        <div>
          <label className="field-label" htmlFor="gHall">Hall</label>
          <select id="gHall" value={p.hall} onChange={(e) => setP({ ...p, hall: e.target.value as HallPlan["hall"] })}>
            <option value="A">A</option><option value="B">B</option><option value="C">C</option>
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="gRpp">RPPs per COD board</label>
          <input id="gRpp" className="field-input" type="number" min={1} max={12} value={p.rppsPerCod} onChange={(e) => setP({ ...p, rppsPerCod: Math.max(1, Math.min(12, Number(e.target.value) || 5)) })} />
        </div>
        <div>
          <label className="field-label" htmlFor="gFrom">First Opti</label>
          <input id="gFrom" className="field-input" type="number" min={1} max={26} value={p.from} onChange={num("from")} />
        </div>
        <div>
          <label className="field-label" htmlFor="gTo">Last Opti</label>
          <input id="gTo" className="field-input" type="number" min={1} max={26} value={p.to} onChange={num("to")} />
        </div>
      </div>
      <label className="check-line"><input type="checkbox" checked={p.components} onChange={flag("components")} />Opti components (GIS through 480 V section 9)</label>
      <label className="check-line"><input type="checkbox" checked={p.gallery} onChange={flag("gallery")} />Gallery: mech panels, fan walls, COD boards</label>
      <label className="check-line"><input type="checkbox" checked={p.rpps} disabled={!p.gallery} onChange={flag("rpps")} />RPPs in the server hall</label>
      <div className="gen-counts" aria-live="polite">
        {Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(" · ")}
        <br /><strong>{drafts.length - already}</strong> new records{already ? `, ${already} already exist and will be skipped` : ""}.
      </div>
      <div className="modal-actions">
        <button className="btn-ghost" type="button" onClick={onClose}>Cancel</button>
        <button className="btn-accent" type="button" disabled={busy || drafts.length === already} onClick={go}>{busy ? "Creating…" : "Create"}</button>
      </div>
    </Modal>
  );
}
