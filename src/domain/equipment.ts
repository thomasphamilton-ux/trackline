import { emptyStages, normalizeStages, DEFAULT_SEQUENCE, type Stages, type StageDef } from "./stages";

export const EQUIPMENT_TYPES = ["Opti", "Opti Component", "Mech Panel", "Fan Wall", "COD Board", "RPP", "Other"] as const;
export type EquipmentType = (typeof EQUIPMENT_TYPES)[number];

/** A, B, C for the data halls; Admin for house equipment. */
export const HALLS = ["A", "B", "C", "Admin"] as const;
export type Hall = (typeof HALLS)[number] | "";
export type Side = "West" | "East" | "";

export interface Seal { code: string; note: string; at: number }

export interface Asset {
  id: string;
  code: string;
  label: string;
  projectId: string;
  equipmentType: EquipmentType;
  hall: Hall;
  side: Side;
  location: string;
  level: string;
  optiNum: string;
  /** The Opti container this component sits in, if any. */
  parentId: string;
  /** Upstream equipment that feeds this one. */
  fedBy: string[];
  createdAt: number;
  updatedAt: number | null;
  updatedBy: string | null;
  stages: Stages;
  seals: Seal[];
  altCodes: string[];
  /** Set when the equipment is turned over to IFS Services for final commissioning. */
  turnoverAt: number | null;
}

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  (list as readonly string[]).includes(str(v)) ? (str(v) as T) : fallback;

/** Fills defaults so older or partial records always render. */
export function normalizeAsset(data: Record<string, unknown> | undefined, id: string, seq: StageDef[] = DEFAULT_SEQUENCE): Asset {
  const d = data ?? {};
  return {
    id,
    code: str(d.code) || id,
    label: str(d.label),
    projectId: str(d.projectId),
    equipmentType: oneOf(d.equipmentType, EQUIPMENT_TYPES, "Other"),
    hall: oneOf<Hall>(d.hall, ["A", "B", "C", "Admin", ""], ""),
    side: oneOf<Side>(d.side, ["West", "East", ""], ""),
    location: str(d.location),
    level: str(d.level),
    optiNum: str(d.optiNum),
    parentId: str(d.parentId),
    fedBy: Array.isArray(d.fedBy) ? d.fedBy.map(str).filter(Boolean) : [],
    createdAt: typeof d.createdAt === "number" ? d.createdAt : Date.now(),
    updatedAt: typeof d.updatedAt === "number" ? d.updatedAt : null,
    updatedBy: d.updatedBy ? str(d.updatedBy) : null,
    stages: normalizeStages(d.stages, seq),
    seals: Array.isArray(d.seals)
      ? d.seals.map((s: any) => ({ code: str(s?.code), note: str(s?.note), at: typeof s?.at === "number" ? s.at : 0 }))
      : [],
    altCodes: Array.isArray(d.altCodes) ? d.altCodes.map(str).filter(Boolean) : [],
    turnoverAt: typeof d.turnoverAt === "number" ? d.turnoverAt : null,
  };
}

export type AssetFields = Partial<Pick<Asset,
  "label" | "equipmentType" | "hall" | "side" | "location" | "level" | "optiNum" | "parentId" | "fedBy">>;

export function newAsset(id: string, code: string, projectId: string, f: AssetFields = {}, seq = DEFAULT_SEQUENCE): Asset {
  return normalizeAsset({ ...f, code, projectId, createdAt: Date.now(), stages: emptyStages(seq) }, id, seq);
}
