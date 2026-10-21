import { test } from "vitest";
import assert from "node:assert/strict";
import { emptyStages, normalizeStages, nextStage, toggleCheck, toggleStage, DEFAULT_SEQUENCE, notStarted } from "../src/domain/stages";
import { can, type Access } from "../src/domain/roles";
import { planHall, fanWallsFor, countByType } from "../src/domain/generator";
import { readImport, parseCsv, exportRows } from "../src/domain/csv";
import { normalizeAsset, newAsset } from "../src/domain/equipment";

test("stage order is the confirmed field order", () => {
  assert.deepEqual(DEFAULT_SEQUENCE.map((s) => s.name), ["Installed", "Terminated", "EC FOD", "L2's Complete", "INT FOD", "FTE"]);
});

test("checked stages complete only when every check is done", () => {
  let s = emptyStages();
  s = toggleStage(s, "Installed", "u1", 1);
  assert.equal(nextStage(s), "Terminated");
  s = toggleCheck(s, "Terminated", "Megger", "u1", 2);
  s = toggleCheck(s, "Terminated", "Point-to-point", "u1", 3);
  assert.equal(s["Terminated"].done, false);
  s = toggleCheck(s, "Terminated", "Torque", "u1", 4);
  assert.equal(s["Terminated"].done, true);
  assert.equal(s["Terminated"].at, 4);
  assert.equal(nextStage(s), "EC FOD");
  s = toggleCheck(s, "Terminated", "Torque", "u1", 5);
  assert.equal(s["Terminated"].done, false);
  assert.equal(toggleStage(s, "Terminated", "u1"), s, "checked stage can't be toggled directly");
});

test("legacy array-shaped stages are read correctly, in the new order", () => {
  const legacy = [
    { name: "Installed", done: true, at: 10 },
    { name: "Terminated", done: true, at: 20, checks: [{ name: "Megger", done: true, at: 11 }, { name: "Point-to-point", done: true, at: 12 }, { name: "Torque", done: true, at: 13 }] },
    { name: "INT FOD", done: true, at: 30, checks: [{ name: "Clean", done: true, at: 1 }] },
  ];
  const s = normalizeStages(legacy);
  assert.equal(s["Installed"].done, true);
  assert.equal(s["Terminated"].done, true);
  assert.equal(s["INT FOD"].done, false, "derived from checks, not trusted");
  assert.equal(s["INT FOD"].checks!["Clean"].done, true);
  assert.equal(nextStage(s), "EC FOD");
  assert.equal(notStarted(s), false);
});

test("roles: viewer read-only, restricted stages for leads only", () => {
  const a = (r: any): Access => ({ isAdmin: false, rolesByProject: { P: r } });
  assert.equal(can.editAssets(a("Viewer"), "P"), false);
  assert.equal(can.openProject(a("Viewer"), "P"), true);
  assert.equal(can.editStage(a("Contractor"), "P", "EC FOD"), true);
  assert.equal(can.editStage(a("Contractor"), "P", "INT FOD"), false);
  assert.equal(can.editStage(a("Contractor"), "P", "FTE"), false);
  assert.equal(can.editStage(a("Supervisor"), "P", "FTE"), true);
  assert.equal(can.manageProject({ isAdmin: true, rolesByProject: {} }, "P"), true);
});

test("fan wall mapping: MP13 feeds 13 and 14, east offset by one", () => {
  assert.deepEqual(fanWallsFor(1), [1]);
  assert.deepEqual(fanWallsFor(13), [13, 14]);
  assert.deepEqual(fanWallsFor(14), [15]);
  assert.deepEqual(fanWallsFor(26), [27]);
});

test("full hall: 26 Optis, 26 MPs, 27 FWs, 26 CODs, 130 RPPs, all IDs unique", () => {
  const d = planHall({ hall: "B", from: 1, to: 26, components: true, gallery: true, rpps: true, rppsPerCod: 5 });
  const c = countByType(d);
  assert.equal(c["Opti"], 26);
  assert.equal(c["Mech Panel"], 26);
  assert.equal(c["Fan Wall"], 27);
  assert.equal(c["COD Board"], 26);
  assert.equal(c["RPP"], 130);
  assert.equal(c["Opti Component"], 26 * 19);
  assert.equal(new Set(d.map((x) => x.id)).size, d.length);
  const fw = d.filter((x) => x.fields.equipmentType === "Fan Wall");
  assert.equal(fw.filter((x) => x.fields.side === "West").length, 14);
  assert.equal(fw.filter((x) => x.fields.side === "East").length, 13);
  const fw15 = d.find((x) => x.id === "FW-15B")!;
  assert.deepEqual(fw15.fields.fedBy, ["MP-14B"]);
  assert.deepEqual(d.find((x) => x.id === "RPP-01B-5")!.fields.fedBy, ["COD-01B"]);
  assert.equal(d.find((x) => x.id === "OPT-01B-GIS")!.fields.parentId, "OPT-01B");
});

test("CSV import reads new columns and leaves blanks out", () => {
  const r = readImport('Asset ID,Type,Hall,Side,Fed By,Label\nMP-01B,mech panel,b,west,OPT-01B,"Panel, 1"\n,,,,,\nX-1,,,,,\n');
  assert.equal(r.error, undefined);
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.rows[0].fields, { label: "Panel, 1", equipmentType: "Mech Panel", hall: "B", side: "West", fedBy: ["OPT-01B"] });
  assert.deepEqual(r.rows[1].fields, {});
  assert.equal(readImport("Location\nx").error, "The CSV needs an Asset ID column.");
  assert.deepEqual(parseCsv('a,"b ""c"""\r\n1,2'), [["a", 'b "c"'], ["1", "2"]]);
});

test("normalizeAsset fills defaults and export has stage columns in order", () => {
  const a = normalizeAsset({ label: "x", equipmentType: "nope" }, "ID1");
  assert.equal(a.equipmentType, "Other");
  assert.deepEqual(a.fedBy, []);
  const n = newAsset("ID2", "ID2", "P", { hall: "C" });
  const rows = exportRows([n]);
  assert.deepEqual(rows[0].slice(10, 16), ["Installed", "Terminated", "EC FOD", "L2's Complete", "INT FOD", "FTE"]);
  assert.equal(rows[1][2], "C");
});
