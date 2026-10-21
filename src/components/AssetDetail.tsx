import { useMemo, useRef } from "react";
import type { Asset } from "../domain/equipment";
import { EQUIPMENT_TYPES } from "../domain/equipment";
import { DEFAULT_SEQUENCE, nextStage, toggleCheck, toggleStage } from "../domain/stages";
import { can } from "../domain/roles";
import { useSession, toast } from "../lib/store";
import { byIdNatural, deleteAsset, patchAsset } from "../lib/data";
import { OPTI_COMPONENTS } from "../domain/generator";
import { download, errMsg, formatDate, formatTime } from "../lib/util";
import { Sheet } from "./Overlay";
import { Qr, type QrHandle } from "./Qr";
import type { ScanType } from "./Scanner";

interface Props {
  pid: string;
  asset: Asset | undefined;
  byId: Map<string, Asset>;
  all: Asset[];
  onClose: () => void;
  onOpen: (id: string) => void;
  onScan: (t: ScanType) => void;
}

/** Opti components list in field order (GIS first), not alphabetically. */
function componentRank(id: string) {
  const i = OPTI_COMPONENTS.findIndex((c) => id.endsWith("-" + c.code));
  return i < 0 ? 999 : i;
}

export function statusText(a: Asset) {
  const n = nextStage(a.stages);
  if (n) return "Next: " + n;
  return a.turnoverAt ? "Turned over" : "Energized";
}

export function AssetDetail({ pid, asset, byId, all, onClose, onOpen, onScan }: Props) {
  const s = useSession();
  const qr = useRef<QrHandle>(null);
  const children = useMemo(() => (asset ? all.filter((a) => a.parentId === asset.id).sort((x, y) => componentRank(x.id) - componentRank(y.id) || byIdNatural(x.id, y.id)) : []), [all, asset]);
  const feeds = useMemo(() => (asset ? all.filter((a) => a.fedBy.includes(asset.id)).sort((x, y) => byIdNatural(x.id, y.id)) : []), [all, asset]);

  if (!asset) {
    return <Sheet title="Asset detail" onClose={onClose}><div className="empty">Asset not found.</div></Sheet>;
  }
  const uid = s.uid!;
  const edit = can.editAssets(s, pid);
  const lead = can.manageIdentifiers(s, pid);
  const save = (patch: Partial<Asset>) =>
    patchAsset(pid, asset.id, patch, uid).catch((e) => toast("Couldn't save: " + errMsg(e)));

  const textField = (field: "label" | "location" | "level" | "optiNum", placeholder: string, wide = false) => (
    <input key={asset.id + field + asset[field]} className={"detail-field" + (wide ? " detail-field-wide" : "")}
      defaultValue={asset[field]} placeholder={placeholder} aria-label={placeholder} disabled={!edit}
      onBlur={(e) => { const v = e.target.value.trim(); if (v !== asset[field]) save({ [field]: v }); }} />
  );

  const ftDone = !!asset.stages["FTE"]?.done;

  return (
    <Sheet title="Asset detail" onClose={onClose}>
      <div className="detail-head">
        <div className="row-type">{asset.equipmentType}{asset.hall ? ` · Hall ${asset.hall}` : ""}{asset.side ? ` · ${asset.side}` : ""}</div>
        <div className="detail-id">{asset.id}</div>
        {textField("label", "Label / description", true)}
        <div className="field-grid">
          <select className="detail-field select-field" aria-label="Equipment type" disabled={!lead} value={asset.equipmentType}
            onChange={(e) => save({ equipmentType: e.target.value as Asset["equipmentType"] })}>
            {EQUIPMENT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <select className="detail-field select-field" aria-label="Hall" disabled={!lead} value={asset.hall}
            onChange={(e) => save({ hall: e.target.value as Asset["hall"] })}>
            <option value="">No hall</option>
            {["A", "B", "C"].map((h) => <option key={h} value={h}>Hall {h}</option>)}
            <option value="Admin">Admin (house)</option>
          </select>
          <select className="detail-field select-field" aria-label="Side" disabled={!lead} value={asset.side}
            onChange={(e) => save({ side: e.target.value as Asset["side"] })}>
            <option value="">No side</option><option>West</option><option>East</option>
          </select>
          {textField("optiNum", "OPTI #")}
          {textField("location", "Location")}
          {textField("level", "Level")}
        </div>
        <div className="detail-created">Added {formatDate(asset.createdAt)}{asset.updatedAt ? ` · Updated ${formatTime(asset.updatedAt)}` : ""}</div>
      </div>

      <div className="detail-qr">
        <Qr ref={qr} text={asset.id} />
        <button className="btn-ghost" onClick={async () => {
          const b = await qr.current?.toBlob();
          if (!b) return toast("QR isn't ready yet. Try reopening this asset.");
          download(asset.id + ".png", b, "image/png");
        }}>Save QR label</button>
      </div>

      {(asset.parentId || asset.fedBy.length > 0 || children.length > 0 || feeds.length > 0) && (
        <div className="detail-section">
          {asset.parentId && <><h3>Inside</h3><LinkList ids={[asset.parentId]} byId={byId} onOpen={onOpen} /></>}
          {asset.fedBy.length > 0 && <><h3>Fed by</h3><LinkList ids={asset.fedBy} byId={byId} onOpen={onOpen} /></>}
          {children.length > 0 && <><h3>Components ({children.length})</h3><LinkList ids={children.map((c) => c.id)} byId={byId} onOpen={onOpen} /></>}
          {feeds.length > 0 && <><h3>Feeds ({feeds.length})</h3><LinkList ids={feeds.map((c) => c.id)} byId={byId} onOpen={onOpen} /></>}
        </div>
      )}

      <div className="detail-section">
        <h3>Linked codes</h3>
        {lead && (
          <div className="seal-actions">
            <button className="btn-accent" onClick={() => onScan("link")}>Scan code to link</button>
            <button className="btn-ghost" onClick={() => s.prompt({ title: "Enter code to link", placeholder: "Scanned QR or barcode value", confirmText: "Link code", onConfirm: (v) => linkCode(pid, asset, all, v, uid) })}>Enter code</button>
          </div>
        )}
        <ul className="seals">
          <li className="seal-row"><span className="seal-code">{asset.id}</span><span /><span className="seal-time">Printed QR</span><span /></li>
          {asset.altCodes.map((code, i) => (
            <li className="seal-row" key={code}>
              <span className="seal-code">{code}</span><span /><span className="seal-time">Linked</span>
              {lead ? <button className="seal-remove" aria-label={`Unlink ${code}`} onClick={() => s.confirm({
                title: "Unlink code", message: "This code will no longer open this asset when scanned.", confirmText: "Unlink", danger: true,
                onConfirm: () => save({ altCodes: asset.altCodes.filter((_, j) => j !== i) }),
              })}>×</button> : <span />}
            </li>
          ))}
        </ul>
      </div>

      <div className="detail-section">
        <h3>Progress</h3>
        <div className="steps">
          {DEFAULT_SEQUENCE.map((def) => {
            const st = asset.stages[def.name];
            const editable = can.editStage(s, pid, def.name);
            if (def.checks) {
              return (
                <div key={def.name}>
                  <div className={"step gated" + (st.done ? " done" : "")}>
                    <span className="step-mark" />
                    <span className="step-body">
                      <span className="step-name">{def.name}{def.restricted ? " · Supervisor" : ""}</span>
                      <span className="step-time">{st.done ? "Complete " + formatTime(st.at) : "Needs all checks below"}</span>
                    </span>
                  </div>
                  <div className="check-list">
                    {def.checks.map((c) => {
                      const m = st.checks?.[c];
                      return (
                        <button key={c} className={"check-row" + (m?.done ? " done" : "")} disabled={!editable} aria-pressed={!!m?.done}
                          onClick={() => save({ stages: toggleCheck(asset.stages, def.name, c, uid) })}>
                          <span className="check-mark" />
                          <span className="check-name">{c}</span>
                          <span className="check-time">{m?.done ? formatTime(m.at) : "Not yet"}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            }
            return (
              <button key={def.name} className={"step" + (st.done ? " done" : "")} disabled={!editable} aria-pressed={st.done}
                onClick={() => save({ stages: toggleStage(asset.stages, def.name, uid) })}>
                <span className="step-mark" />
                <span className="step-body">
                  <span className="step-name">{def.name}</span>
                  <span className="step-time">{st.done ? formatTime(st.at) : "Not yet"}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="turnover-box">
          <span className="turnover-text">
            {asset.turnoverAt ? <>Turned over to IFS Services <strong>{formatDate(asset.turnoverAt)}</strong></> :
              ftDone ? "FTE complete. Ready to turn over to IFS Services for final commissioning." : "Turnover to IFS Services opens after FTE."}
          </span>
          {lead && (asset.turnoverAt ? (
            <button className="btn-ghost btn-sm" onClick={() => s.confirm({ title: "Undo turnover", message: "Clear the turnover date for " + asset.id + "?", confirmText: "Undo", danger: true, onConfirm: () => save({ turnoverAt: null }) })}>Undo</button>
          ) : (
            <button className="btn-accent btn-sm" disabled={!ftDone} onClick={() => save({ turnoverAt: Date.now() })}>Turn over</button>
          ))}
        </div>
      </div>

      <div className="detail-section">
        <h3>Tamper seals</h3>
        {lead && (
          <div className="seal-actions">
            <button className="btn-accent" onClick={() => onScan("seal")}>Scan seal</button>
            <button className="btn-ghost" onClick={() => s.prompt({ title: "Enter tamper seal code", placeholder: "Seal code / barcode number", confirmText: "Add seal", onConfirm: (v) => addSeal(pid, asset, v, uid) })}>Enter code</button>
          </div>
        )}
        <ul className="seals">
          {asset.seals.length === 0 && <li className="empty-sm">No tamper seals logged yet.</li>}
          {asset.seals.map((seal, i) => (
            <li className="seal-row" key={seal.code + i}>
              <span className="seal-code">{seal.code}</span>
              <input className="seal-note" placeholder="Add note" aria-label={`Note for seal ${seal.code}`} defaultValue={seal.note} disabled={!edit} key={seal.note}
                onBlur={(e) => { if (e.target.value !== seal.note) save({ seals: asset.seals.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)) }); }} />
              <span className="seal-time">{formatTime(seal.at)}</span>
              {lead ? <button className="seal-remove" aria-label={`Remove seal ${seal.code}`} onClick={() => s.confirm({
                title: "Remove seal record", message: "Remove this tamper seal entry? This can't be undone.", confirmText: "Remove", danger: true,
                onConfirm: () => save({ seals: asset.seals.filter((_, j) => j !== i) }),
              })}>×</button> : <span />}
            </li>
          ))}
        </ul>
      </div>

      {can.deleteAssets(s, pid) && (
        <div className="detail-section">
          <button className="btn-danger" onClick={() => s.confirm({
            title: "Remove asset", message: `This deletes all progress and seal history for ${asset.id}. This can't be undone.`, confirmText: "Remove asset", danger: true,
            onConfirm: () => { onClose(); deleteAsset(pid, asset.id).catch((e) => toast("Couldn't delete: " + errMsg(e))); },
          })}>Remove asset</button>
        </div>
      )}
    </Sheet>
  );
}

function LinkList({ ids, byId, onOpen }: { ids: string[]; byId: Map<string, Asset>; onOpen: (id: string) => void }) {
  return (
    <ul className="link-list">
      {ids.map((id) => {
        const a = byId.get(id);
        return (
          <li key={id}>
            <button className="link-row" onClick={() => a && onOpen(id)} disabled={!a}>
              <span className="row-main"><span className="row-id">{id}</span><span className="row-label">{a ? a.label : "Not in this project"}</span></span>
              {a && <span className={"row-status" + (nextStage(a.stages) ? "" : " good")}>{statusText(a)}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export const codeBelongsTo = (a: Asset, code: string) => a.id === code || a.code === code || a.altCodes.includes(code);

export function addSeal(pid: string, a: Asset, code: string, uid: string) {
  if (!code) return;
  patchAsset(pid, a.id, { seals: [...a.seals, { code, note: "", at: Date.now() }] }, uid)
    .then(() => toast("Tamper seal logged."))
    .catch((e) => toast("Couldn't save: " + errMsg(e)));
}

export function linkCode(pid: string, a: Asset, all: Asset[], raw: string, uid: string) {
  const code = raw.trim();
  if (!code) return;
  const conflict = all.find((x) => x.id !== a.id && codeBelongsTo(x, code));
  if (conflict) return toast(`That code is already assigned to ${conflict.label || conflict.id}.`);
  if (codeBelongsTo(a, code)) return toast("That code is already linked to this asset.");
  patchAsset(pid, a.id, { altCodes: [...a.altCodes, code] }, uid)
    .then(() => toast("Code linked to this asset."))
    .catch((e) => toast("Couldn't save: " + errMsg(e)));
}
