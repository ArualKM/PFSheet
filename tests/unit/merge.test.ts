import { describe, it, expect } from "vitest";
import { createDefaultCharacter, parseCharacter, type PathForgeCharacterV1 } from "@pathforge/schema";
import { threeWayMerge } from "@/lib/character/merge";

/** A base sheet + two independently-edited clones (the desktop/mobile scenario). */
function forked(): [PathForgeCharacterV1, PathForgeCharacterV1, PathForgeCharacterV1] {
  const base = createDefaultCharacter({ name: "Seraphina Vale" });
  return [base, structuredClone(base), structuredClone(base)];
}

type Feat = PathForgeCharacterV1["feats"]["list"][number];
const feat = (id: string, name: string, extra: Record<string, unknown> = {}): Feat =>
  ({ id, name, tags: [], automation: [], ...extra }) as unknown as Feat;

describe("threeWayMerge", () => {
  it("no divergence → clean merge equal to base", () => {
    const [base, mine, theirs] = forked();
    const { merged, conflicts } = threeWayMerge(base, mine, theirs);
    expect(conflicts).toHaveLength(0);
    expect(merged).toEqual(base);
  });

  it("disjoint scalar edits both apply with no conflict", () => {
    const [base, mine, theirs] = forked();
    mine.identity.name = "Seraphina the Bold";
    theirs.identity.alignment = "NG";
    const { merged, conflicts } = threeWayMerge(base, mine, theirs);
    expect(conflicts).toHaveLength(0);
    expect(merged.identity.name).toBe("Seraphina the Bold");
    expect(merged.identity.alignment).toBe("NG");
  });

  it("same field changed identically on both sides is not a conflict", () => {
    const [base, mine, theirs] = forked();
    mine.identity.alignment = "CG";
    theirs.identity.alignment = "CG";
    const { merged, conflicts } = threeWayMerge(base, mine, theirs);
    expect(conflicts).toHaveLength(0);
    expect(merged.identity.alignment).toBe("CG");
  });

  it("same field changed differently is a conflict (defaults to mine)", () => {
    const [base, mine, theirs] = forked();
    mine.identity.name = "Mine Name";
    theirs.identity.name = "Their Name";
    const { merged, conflicts } = threeWayMerge(base, mine, theirs);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.path).toBe("identity.name");
    expect(conflicts[0]).toMatchObject({ mine: "Mine Name", theirs: "Their Name" });
    expect(merged.identity.name).toBe("Mine Name");
  });

  it("entity arrays: concurrent adds of different feats both survive (merge by id)", () => {
    const [base, mine, theirs] = forked();
    mine.feats.list.push(feat("f-a", "Power Attack"));
    theirs.feats.list.push(feat("f-b", "Dodge"));
    const { merged, conflicts } = threeWayMerge(base, mine, theirs);
    expect(conflicts).toHaveLength(0);
    const names = merged.feats.list.map((f) => f.name).sort();
    expect(names).toEqual(["Dodge", "Power Attack"]);
  });

  it("entity arrays: edits to different fields of the same feat both apply", () => {
    const [base, mine, theirs] = forked();
    base.feats.list.push(feat("f-x", "Combat Expertise"));
    mine.feats.list.push(feat("f-x", "Combat Expertise", { notes: "from mine" }));
    theirs.feats.list.push(feat("f-x", "Combat Expertise", { benefit: "−Atk/+AC" }));
    const { merged, conflicts } = threeWayMerge(base, mine, theirs);
    expect(conflicts).toHaveLength(0);
    const x = merged.feats.list.find((f) => f.id === "f-x");
    expect(x?.notes).toBe("from mine");
    expect(x?.benefit).toBe("−Atk/+AC");
  });

  it("entity arrays: same field of the same feat edited differently is a conflict", () => {
    const [base, mine, theirs] = forked();
    base.feats.list.push(feat("f-x", "Toughness", { notes: "base" }));
    mine.feats.list.push(feat("f-x", "Toughness", { notes: "mine" }));
    theirs.feats.list.push(feat("f-x", "Toughness", { notes: "theirs" }));
    const { conflicts } = threeWayMerge(base, mine, theirs);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.path).toBe("feats.list[id=f-x].notes");
  });

  it("entity arrays: delete on one side + edit of a DIFFERENT entry both apply", () => {
    const [base, mine, theirs] = forked();
    base.feats.list.push(feat("f-x", "Cleave"), feat("f-y", "Great Cleave"));
    mine.feats.list = structuredClone(base.feats.list).filter((f) => f.id !== "f-x"); // mine deletes X
    theirs.feats.list = structuredClone(base.feats.list);
    const ty = theirs.feats.list.find((f) => f.id === "f-y");
    if (ty) ty.notes = "edited";
    const { merged, conflicts } = threeWayMerge(base, mine, theirs);
    expect(conflicts).toHaveLength(0);
    expect(merged.feats.list.map((f) => f.id)).toEqual(["f-y"]);
    expect(merged.feats.list[0]?.notes).toBe("edited");
  });

  it("entity arrays: delete vs edit of the SAME entry is a conflict (keeps the edit)", () => {
    const [base, mine, theirs] = forked();
    base.feats.list.push(feat("f-x", "Power Attack", { notes: "base" }));
    mine.feats.list = []; // mine deletes X
    theirs.feats.list = [feat("f-x", "Power Attack", { notes: "theirs edited" })];
    const { merged, conflicts } = threeWayMerge(base, mine, theirs);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.path).toBe("feats.list[id=f-x]");
    expect(merged.feats.list.find((f) => f.id === "f-x")?.notes).toBe("theirs edited");
  });

  it("value arrays: concurrent set additions union", () => {
    const [base, mine, theirs] = forked();
    base.feats.list.push(feat("f-x", "Skill Focus", { tags: ["base"] }));
    mine.feats.list.push(feat("f-x", "Skill Focus", { tags: ["base", "mine"] }));
    theirs.feats.list.push(feat("f-x", "Skill Focus", { tags: ["base", "theirs"] }));
    const { merged, conflicts } = threeWayMerge(base, mine, theirs);
    expect(conflicts).toHaveLength(0);
    expect(merged.feats.list.find((f) => f.id === "f-x")?.tags.sort()).toEqual(["base", "mine", "theirs"]);
  });

  it("a realistic divergence merges to a schema-valid document", () => {
    const [base, mine, theirs] = forked();
    mine.identity.race = "Aasimar";
    mine.feats.list.push(feat("f-a", "Power Attack"));
    theirs.abilities.primary.str.score = 16;
    theirs.feats.list.push(feat("f-b", "Dodge"));
    const { merged, conflicts } = threeWayMerge(base, mine, theirs);
    expect(conflicts).toHaveLength(0);
    const reparsed = parseCharacter(merged);
    expect(reparsed.identity.race).toBe("Aasimar");
    expect(reparsed.abilities.primary.str.score).toBe(16);
    expect(reparsed.feats.list.map((f) => f.name).sort()).toEqual(["Dodge", "Power Attack"]);
  });
});
