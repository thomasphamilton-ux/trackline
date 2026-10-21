/** Firestore-safe ID cleanup, matching the legacy app's rules. */
export function sanitizeId(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = String(raw).trim().replace(/[^A-Za-z0-9_\-.~:@+]/g, "-");
  s = s.replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
  return s.slice(0, 180);
}

function stamp(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rnd}`;
}
export const genAssetId = () => stamp("AST");
export const genProjectId = () => stamp("PRJ");
