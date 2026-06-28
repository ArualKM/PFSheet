// Quick test to verify the stale appliesTo edge case

import { createDefaultCharacter } from '@pathforge/schema';
import { threeWayMerge } from '@/lib/character/merge.js';

// Scenario: 
// - Base: both sides start with a sphere "Fire" (id: sphere-1) and a drawback "Somatic" targeting it
// - Side A (mine): changes drawback "Somatic"'s appliesTo to sphere "Air" (id: sphere-2)
// - Side B (theirs): deletes sphere "Air" (id: sphere-2) entirely
// The 3-way merge should preserve both changes (they're disjoint keys in drawbackMeta), 
// leaving a dangling reference to a sphere that no longer exists

const base = createDefaultCharacter({ name: "Test" });
base.spheres = {
  casterClasses: [],
  spheres: [
    { id: "sphere-1", name: "Fire", system: "Magic" },
    { id: "sphere-2", name: "Air", system: "Magic" }
  ],
  talents: [],
  drawbacks: ["Somatic"],
  drawbackMeta: {
    "Somatic": {
      system: "Magic",
      appliesTo: { kind: "sphere", id: "sphere-1" }
    }
  }
};

const mine = structuredClone(base);
const theirs = structuredClone(base);

// Side A (mine): retarget drawback to sphere-2
mine.spheres.drawbackMeta = {
  "Somatic": {
    system: "Magic",
    appliesTo: { kind: "sphere", id: "sphere-2" }
  }
};

// Side B (theirs): delete sphere-2 entirely
theirs.spheres.spheres = theirs.spheres.spheres.filter(s => s.id !== "sphere-2");

console.log("Base drawbacks:", base.spheres.drawbacks);
console.log("Base drawbackMeta:", base.spheres.drawbackMeta);
console.log("Base spheres:", base.spheres.spheres.map(s => s.id));
console.log("");

console.log("Mine drawbackMeta:", mine.spheres.drawbackMeta);
console.log("");

console.log("Theirs spheres:", theirs.spheres.spheres.map(s => s.id));
console.log("");

const { merged, conflicts } = threeWayMerge(base, mine, theirs);

console.log("=== MERGE RESULT ===");
console.log("Conflicts:", conflicts);
console.log("");
console.log("Merged spheres:", merged.spheres?.spheres.map(s => s.id));
console.log("Merged drawbackMeta:", merged.spheres?.drawbackMeta);
console.log("");

// THE ISSUE: drawbackMeta still contains the stale reference
if (merged.spheres?.drawbackMeta?.["Somatic"]?.appliesTo?.id === "sphere-2") {
  console.log("❌ EDGE CASE CONFIRMED: dangling reference to deleted sphere-2!");
  console.log("   The merge preserved both changes (disjoint keys), leaving metadata orphaned.");
} else {
  console.log("✓ No stale reference found");
}
