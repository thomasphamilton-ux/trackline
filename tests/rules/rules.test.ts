import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, test } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, setDoc, updateDoc, getDoc } from "firebase/firestore";
import { emptyStages, toggleCheck, toggleStage } from "../../src/domain/stages";
import { newAsset } from "../../src/domain/equipment";

let env: RulesTestEnvironment;
const P = "dnn4";

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-trackline",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, "admins/admin"), { name: "Admin" });
    await setDoc(doc(db, `projects/${P}`), { name: "Dalton 4", createdAt: 1 });
    for (const [uid, role] of [["sup", "Supervisor"], ["con", "Contractor"], ["view", "Viewer"]]) {
      await setDoc(doc(db, `members/${P}_${uid}`), { projectId: P, userId: uid, userName: uid, role, addedAt: 1 });
    }
    await setDoc(doc(db, `projects/${P}/assets/OPT-01B`), { ...newAsset("OPT-01B", "OPT-01B", P, { equipmentType: "Opti" }), progress: "Installed" });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const asset = (uid: string) => doc(as(uid), `projects/${P}/assets/OPT-01B`);

describe("assets", () => {
  test("members read, outsiders don't", async () => {
    await assertSucceeds(getDoc(asset("view")));
    await assertSucceeds(getDoc(asset("con")));
    await assertFails(getDoc(asset("stranger")));
  });

  test("viewer can't change anything", async () => {
    await assertFails(updateDoc(asset("view"), { label: "x", updatedBy: "view", updatedAt: 1 }));
  });

  test("contractor can work EC FOD but not INT FOD or FTE", async () => {
    const s = emptyStages();
    await assertSucceeds(updateDoc(asset("con"), { stages: toggleStage(s, "Installed", "con"), progress: "Terminated", updatedBy: "con", updatedAt: 1 }));
    await assertSucceeds(updateDoc(asset("con"), { stages: toggleCheck(s, "EC FOD", "Clean", "con"), updatedBy: "con", updatedAt: 2 }));
    await assertFails(updateDoc(asset("con"), { stages: toggleCheck(s, "INT FOD", "Clean", "con"), updatedBy: "con", updatedAt: 3 }));
    await assertFails(updateDoc(asset("con"), { stages: toggleCheck(s, "FTE", "MOP complete", "con"), updatedBy: "con", updatedAt: 4 }));
  });

  test("contractor can't impersonate, turn over, link codes, type, or add seals", async () => {
    await assertFails(updateDoc(asset("con"), { label: "x", updatedBy: "sup", updatedAt: 1 }));
    await assertFails(updateDoc(asset("con"), { turnoverAt: 5, updatedBy: "con", updatedAt: 1 }));
    await assertFails(updateDoc(asset("con"), { altCodes: ["X"], updatedBy: "con", updatedAt: 1 }));
    await assertFails(updateDoc(asset("con"), { equipmentType: "RPP", updatedBy: "con", updatedAt: 1 }));
    await assertFails(updateDoc(asset("con"), { seals: [{ code: "S1", note: "", at: 1 }], updatedBy: "con", updatedAt: 1 }));
    await assertSucceeds(updateDoc(asset("con"), { label: "Opti 01B", location: "Pad 3", updatedBy: "con", updatedAt: 1 }));
  });

  test("supervisor can do restricted stages, turnover, create and delete", async () => {
    await assertSucceeds(updateDoc(asset("sup"), { stages: toggleCheck(emptyStages(), "FTE", "MOP complete", "sup"), turnoverAt: 9, updatedBy: "sup", updatedAt: 1 }));
    const fresh = newAsset("MP-01B", "MP-01B", P, { equipmentType: "Mech Panel" });
    await assertSucceeds(setDoc(doc(as("sup"), `projects/${P}/assets/MP-01B`), fresh));
    await assertFails(setDoc(doc(as("con"), `projects/${P}/assets/MP-02B`), fresh));
    await assertFails(setDoc(doc(as("sup"), `projects/${P}/assets/MP-03B`), { ...fresh, projectId: "other" }));
    await assertSucceeds(deleteDoc(doc(as("sup"), `projects/${P}/assets/MP-01B`)));
    await assertFails(deleteDoc(asset("con")));
  });

  test("admin can use the Unassigned bucket; others can't", async () => {
    const a = newAsset("X1", "X1", "");
    await assertSucceeds(setDoc(doc(as("admin"), "projects/_unassigned/assets/X1"), a));
    await assertFails(getDoc(doc(as("sup"), "projects/_unassigned/assets/X1")));
  });
});

describe("members", () => {
  test("supervisor adds contractors and viewers, never admins; contractors add nobody", async () => {
    const m = (uid: string, role: string) => ({ projectId: P, userId: uid, userName: uid, role, addedAt: 1 });
    await assertSucceeds(setDoc(doc(as("sup"), `members/${P}_new1`), m("new1", "Viewer")));
    await assertFails(setDoc(doc(as("sup"), `members/${P}_new2`), m("new2", "Admin")));
    await assertFails(setDoc(doc(as("con"), `members/${P}_new3`), m("new3", "Contractor")));
    await assertFails(setDoc(doc(as("sup"), `members/other_new4`), { ...m("new4", "Contractor"), projectId: "other" }));
  });

  test("project IDs with underscores work", async () => {
    const pid = "dnn_4";
    await assertSucceeds(setDoc(doc(as("admin"), `members/${pid}_u9`), { projectId: pid, userId: "u9", userName: "u9", role: "Contractor", addedAt: 1 }));
    await assertSucceeds(deleteDoc(doc(as("admin"), `members/${pid}_u9`)));
  });
});
