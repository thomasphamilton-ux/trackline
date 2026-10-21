/**
 * Energization stages, in the confirmed field order:
 * Installed -> Terminated -> EC FOD -> L2's Complete -> INT FOD (yellow-tag walk) -> FTE (energization MOP).
 * After FTE the equipment is turned over to IFS Services for final commissioning,
 * recorded as a turnover date, not as another stage.
 */
export interface StageDef {
  name: string;
  /** When set, the stage completes only when every check is done. */
  checks?: string[];
  /** Only Admins and Supervisors can change it. */
  restricted?: boolean;
  /** Short label for chips and dots. */
  short: string;
}

export const DEFAULT_SEQUENCE: StageDef[] = [
  { name: "Installed", short: "Inst" },
  { name: "Terminated", short: "Term", checks: ["Megger", "Point-to-point", "Torque"] },
  { name: "EC FOD", short: "EC", checks: ["Clean", "No-Tools", "No-Debris", "all Grounds tight", "Sharp Edge Protection"] },
  { name: "L2's Complete", short: "L2", checks: ["all applicable checklists complete"] },
  { name: "INT FOD", short: "INT", restricted: true, checks: ["Clean", "No-Tools", "No-Debris", "all Grounds tight", "Sharp Edge Protection"] },
  { name: "FTE", short: "FTE", restricted: true, checks: ["MOP complete", "Voltage Checks", "Rotation CW"] },
];

export interface Mark { done: boolean; at: number | null; by?: string | null }
export interface StageState extends Mark { checks?: Record<string, Mark> }
/** Keyed by stage name so security rules can compare one stage at a time. */
export type Stages = Record<string, StageState>;

const blank = (): Mark => ({ done: false, at: null, by: null });

export function emptyStages(seq: StageDef[] = DEFAULT_SEQUENCE): Stages {
  const out: Stages = {};
  for (const def of seq) {
    const st: StageState = blank();
    if (def.checks) st.checks = Object.fromEntries(def.checks.map((c) => [c, blank()]));
    out[def.name] = st;
  }
  return out;
}

function asMark(v: unknown): Mark {
  const o = (v ?? {}) as Partial<Mark>;
  return { done: !!o.done, at: typeof o.at === "number" ? o.at : null, by: o.by ?? null };
}

/**
 * Accepts the new map shape or the legacy array shape
 * ([{name, done, at, checks:[{name,done,at}]}]) and returns a complete map for `seq`.
 * A checked stage's done flag is always derived from its checks.
 */
export function normalizeStages(raw: unknown, seq: StageDef[] = DEFAULT_SEQUENCE): Stages {
  const byName: Record<string, any> = {};
  if (Array.isArray(raw)) {
    for (const s of raw) if (s && typeof s.name === "string") byName[s.name] = s;
  } else if (raw && typeof raw === "object") {
    Object.assign(byName, raw as object);
  }
  const out: Stages = {};
  for (const def of seq) {
    const found = byName[def.name];
    const st: StageState = asMark(found);
    if (def.checks) {
      const foundChecks: Record<string, any> = {};
      if (Array.isArray(found?.checks)) {
        for (const c of found.checks) if (c?.name) foundChecks[c.name] = c;
      } else if (found?.checks && typeof found.checks === "object") {
        Object.assign(foundChecks, found.checks);
      }
      st.checks = Object.fromEntries(def.checks.map((c) => [c, asMark(foundChecks[c])]));
      const all = Object.values(st.checks).every((c) => c.done);
      if (!all) { st.done = false; st.at = null; st.by = null; }
      else if (!st.done) { st.done = true; st.at = st.at ?? latest(st.checks); }
    }
    out[def.name] = st;
  }
  return out;
}

function latest(checks: Record<string, Mark>): number | null {
  const ts = Object.values(checks).map((c) => c.at ?? 0);
  const m = Math.max(0, ...ts);
  return m || null;
}

export function nextStage(stages: Stages, seq: StageDef[] = DEFAULT_SEQUENCE): string | null {
  for (const def of seq) if (!stages[def.name]?.done) return def.name;
  return null;
}
export const isComplete = (stages: Stages, seq: StageDef[] = DEFAULT_SEQUENCE) => nextStage(stages, seq) === null;
export const notStarted = (stages: Stages, seq: StageDef[] = DEFAULT_SEQUENCE) =>
  seq.every((d) => !stages[d.name]?.done && !Object.values(stages[d.name]?.checks ?? {}).some((c) => c.done));

/** Toggle a stage that has no checklist. Returns a new map, or the same map if not allowed. */
export function toggleStage(stages: Stages, name: string, who: string, now = Date.now(), seq = DEFAULT_SEQUENCE): Stages {
  const def = seq.find((d) => d.name === name);
  if (!def || def.checks) return stages;
  const cur = stages[name] ?? blank();
  const done = !cur.done;
  return { ...stages, [name]: { ...cur, done, at: done ? now : null, by: done ? who : null } };
}

export function toggleCheck(stages: Stages, name: string, check: string, who: string, now = Date.now(), seq = DEFAULT_SEQUENCE): Stages {
  const def = seq.find((d) => d.name === name);
  if (!def?.checks?.includes(check)) return stages;
  const cur = stages[name] ?? { ...blank(), checks: {} };
  const c = cur.checks?.[check] ?? blank();
  const nextC: Mark = c.done ? blank() : { done: true, at: now, by: who };
  const checks = { ...(cur.checks ?? {}), [check]: nextC };
  const all = def.checks.every((k) => checks[k]?.done);
  const st: StageState = all
    ? { done: true, at: cur.done ? cur.at : now, by: cur.done ? cur.by : who, checks }
    : { done: false, at: null, by: null, checks };
  return { ...stages, [name]: st };
}
