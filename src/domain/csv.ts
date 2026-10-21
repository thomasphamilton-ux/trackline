import type { Asset, AssetFields } from "./equipment";
import { EQUIPMENT_TYPES } from "./equipment";
import { DEFAULT_SEQUENCE, type StageDef } from "./stages";

export function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");

/** RFC 4180-style parser, same behavior as the legacy app. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += c;
      continue;
    }
    if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  row.push(field);
  rows.push(row);
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

type Key = "id" | keyof AssetFields;
const HEADER_MAP: Record<string, Key> = {
  "asset id": "id", assetid: "id", id: "id",
  type: "equipmentType", "equipment type": "equipmentType",
  hall: "hall", side: "side",
  location: "location", site: "location",
  level: "level", floor: "level",
  "opti#": "optiNum", "opti #": "optiNum", opti: "optiNum", "opti number": "optiNum", optinumber: "optiNum",
  parent: "parentId", "parent id": "parentId", "in opti": "parentId",
  "fed by": "fedBy", fedby: "fedBy",
  label: "label", description: "label", notes: "label",
};

export const IMPORT_COLUMNS = ["Asset ID", "Type", "Hall", "Side", "Location", "Level", "OPTI#", "Parent", "Fed By", "Label"];
export const IMPORT_SAMPLE = ["MP-01B", "Mech Panel", "B", "West", "Gallery", "1", "01B", "", "OPT-01B", "Mech panel 01B"];

export interface ImportRow { rawId: string; fields: AssetFields }
export interface ImportResult { rows: ImportRow[]; skipped: number; error?: string }

/** Reads a CSV into asset rows. Blank cells are left out so they don't overwrite existing values. */
export function readImport(text: string): ImportResult {
  const rows = parseCsv(text);
  if (rows.length < 2) return { rows: [], skipped: 0, error: "That file doesn't have any data rows." };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col: Partial<Record<Key, number>> = {};
  header.forEach((h, i) => { const k = HEADER_MAP[h]; if (k && col[k] === undefined) col[k] = i; });
  if (col.id === undefined) return { rows: [], skipped: 0, error: "The CSV needs an Asset ID column." };
  const out: ImportRow[] = [];
  let skipped = 0;
  for (const cells of rows.slice(1)) {
    if (cells.every((c) => c.trim() === "")) continue;
    const rawId = (cells[col.id] ?? "").trim();
    if (!rawId) { skipped++; continue; }
    const get = (k: Key) => (col[k] !== undefined ? (cells[col[k]!] ?? "").trim() : "");
    const f: AssetFields = {};
    for (const k of ["label", "location", "level", "optiNum", "parentId"] as const) { const v = get(k); if (v) f[k] = v; }
    const t = get("equipmentType");
    if (t) {
      const match = EQUIPMENT_TYPES.find((x) => x.toLowerCase() === t.toLowerCase());
      f.equipmentType = match ?? "Other";
    }
    const hall = get("hall");
    if (hall) {
      const h = hall.toUpperCase() === "ADMIN" ? "Admin" : hall.toUpperCase();
      if (["A", "B", "C", "Admin"].includes(h)) f.hall = h as AssetFields["hall"];
    }
    const side = get("side").toLowerCase();
    if (side === "west" || side === "east") f.side = side === "west" ? "West" : "East";
    const fed = get("fedBy");
    if (fed) f.fedBy = fed.split(/[;|]/).map((s) => s.trim()).filter(Boolean);
    out.push({ rawId, fields: f });
  }
  return { rows: out, skipped };
}

const day = (ts: number | null) =>
  ts ? new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";

export function exportRows(assets: Asset[], seq: StageDef[] = DEFAULT_SEQUENCE): unknown[][] {
  const header = [...IMPORT_COLUMNS, ...seq.map((s) => s.name), "Turnover to IFS", "Tamper Seals"];
  const rows = assets.map((a) => [
    a.id, a.equipmentType, a.hall, a.side, a.location, a.level, a.optiNum, a.parentId, a.fedBy.join("; "), a.label,
    ...seq.map((s) => (a.stages[s.name]?.done ? day(a.stages[s.name].at) : "")),
    day(a.turnoverAt),
    a.seals.map((s) => s.code).join("; "),
  ]);
  return [header, ...rows];
}
