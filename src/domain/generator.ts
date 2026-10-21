import type { AssetFields, Hall, Side } from "./equipment";

/**
 * DNN4 equipment chain for one data hall (confirmed Oct 20, 2026):
 * - Each Opti is a container; GIS through 480 V section 9 are components inside it.
 * - Opti NN feeds Mech Panel NN and COD Board NN (gallery).
 * - West: MP01-MP12 feed FW01-FW12, MP13 feeds FW13 and FW14 (14 fan walls).
 * - East: MP14-MP26 feed FW15-FW27, one each (13 fan walls).
 * - Each COD board has 5 breakers, one per RPP in the server hall.
 * ID formats are placeholders until the tag format is confirmed.
 */
export const OPTI_COMPONENTS: { code: string; label: string }[] = [
  { code: "GIS", label: "GIS (A01, A02, A03)" },
  { code: "XFMR", label: "34.5 kV / 480 V transformer" },
  { code: "SWGR", label: "480 V switchgear, sections 1-9" },
  { code: "MUPS", label: "Mechanical UPS" },
  { code: "MBP", label: "Maintenance bypass panel" },
  { code: "CUPS1", label: "Critical UPS 1" },
  { code: "CUPS2", label: "Critical UPS 2" },
  { code: "PCM1", label: "PCM 1" },
  { code: "PCM2", label: "PCM 2" },
  { code: "PCM3", label: "PCM 3" },
  { code: "PCM4", label: "PCM 4" },
  { code: "PCM5", label: "PCM 5" },
  { code: "CWP", label: "Chilled water pump skid" },
  { code: "CHA", label: "Chiller A" },
  { code: "CHB", label: "Chiller B" },
  { code: "NPP", label: "NPP transformer and panelboard" },
  { code: "UPP", label: "UPP transformer and panelboard" },
  { code: "GPP", label: "GPP transformer and panelboard" },
  { code: "XFMR415", label: "480 V / 415 V transformer" },
];

export interface HallPlan {
  hall: Exclude<Hall, "" | "Admin">;
  from: number; // first Opti number, 1-26
  to: number; // last Opti number, 1-26
  components: boolean;
  gallery: boolean;
  rpps: boolean;
  rppsPerCod: number;
}

export interface Draft { id: string; fields: AssetFields }

const two = (n: number) => String(n).padStart(2, "0");
export const sideOf = (n: number): Side => (n <= 13 ? "West" : "East");

/** Fan walls fed by mech panel n: MP13 feeds two, east side is offset by one. */
export function fanWallsFor(n: number): number[] {
  if (n < 13) return [n];
  if (n === 13) return [13, 14];
  return [n + 1];
}

export const ids = {
  opti: (h: string, n: number) => `OPT-${two(n)}${h}`,
  component: (h: string, n: number, code: string) => `OPT-${two(n)}${h}-${code}`,
  mechPanel: (h: string, n: number) => `MP-${two(n)}${h}`,
  fanWall: (h: string, n: number) => `FW-${two(n)}${h}`,
  cod: (h: string, n: number) => `COD-${two(n)}${h}`,
  rpp: (h: string, n: number, k: number) => `RPP-${two(n)}${h}-${k}`,
};

export function planHall(p: HallPlan): Draft[] {
  const out: Draft[] = [];
  const lo = Math.max(1, Math.min(p.from, p.to));
  const hi = Math.min(26, Math.max(p.from, p.to));
  const h = p.hall;
  for (let n = lo; n <= hi; n++) {
    const side = sideOf(n);
    const opti = ids.opti(h, n);
    const base = { hall: h, side, optiNum: `${two(n)}${h}` } as const;
    out.push({ id: opti, fields: { ...base, equipmentType: "Opti", label: `Optistax ${two(n)}${h}`, location: "Opti" } });
    if (p.components) {
      for (const c of OPTI_COMPONENTS) {
        out.push({
          id: ids.component(h, n, c.code),
          fields: { ...base, equipmentType: "Opti Component", label: c.label, location: "Opti", parentId: opti },
        });
      }
    }
    if (p.gallery) {
      const mp = ids.mechPanel(h, n);
      out.push({ id: mp, fields: { ...base, equipmentType: "Mech Panel", label: `Mech panel ${two(n)}${h}`, location: "Gallery", fedBy: [opti] } });
      for (const fw of fanWallsFor(n)) {
        out.push({
          id: ids.fanWall(h, fw),
          fields: { ...base, equipmentType: "Fan Wall", label: `Fan wall ${two(fw)}${h}`, location: "Gallery", fedBy: [mp] },
        });
      }
      const cod = ids.cod(h, n);
      out.push({ id: cod, fields: { ...base, equipmentType: "COD Board", label: `COD board ${two(n)}${h}`, location: "Gallery", fedBy: [opti] } });
      if (p.rpps) {
        for (let k = 1; k <= p.rppsPerCod; k++) {
          out.push({
            id: ids.rpp(h, n, k),
            fields: { ...base, equipmentType: "RPP", label: `RPP ${two(n)}${h}-${k} (COD breaker ${k})`, location: "Server Hall", fedBy: [cod] },
          });
        }
      }
    }
  }
  return out;
}

export function countByType(drafts: Draft[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const d of drafts) c[d.fields.equipmentType ?? "Other"] = (c[d.fields.equipmentType ?? "Other"] ?? 0) + 1;
  return c;
}
