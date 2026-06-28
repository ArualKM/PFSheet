# Verification of: Stale appliesTo targets after concurrent merge

## FINDING SUMMARY
When concurrently editing: side A retargets a drawback's appliesTo to sphere X, while side B deletes sphere X entirely. The 3-way merge preserves both changes (disjoint keys), leaving a dangling reference.

## VERIFICATION RESULTS

### 1. MERGE BEHAVIOR - CONFIRMED
**File:** `/lib/character/merge.ts` lines 77-103

The mergeValue function logic:
```
if (deepEqual(mine, theirs)) return mine;           // Both agree
if (deepEqual(mine, base)) return theirs;           // Theirs changed, mine didn't  
if (deepEqual(theirs, base)) return mine;           // Mine changed, theirs didn't
```

In the edge case:
- Side A (mine) changes: drawbackMeta["Somatic"].appliesTo = {kind: "sphere", id: "sphere-air"}
- Side B (theirs) changes: spheres.filter(s => s.id !== "sphere-air") (deletes sphere-air)
- Base: drawbackMeta["Somatic"].appliesTo = {kind: "sphere", id: "sphere-fire"}

During merge:
- spheres array: merged correctly (sphere-air deleted from both mining paths)
- drawbackMeta["Somatic"]: line 88 applies (theirs == base, mine changed)
  → Returns MINE's version with stale reference to sphere-air

**Result:** ✓ CONFIRMED - Stale reference is preserved in merged document

### 2. READ VIEW SAFETY - CONFIRMED SAFE
**File:** `/packages/pathforge-schema/src/spheres.ts` lines 74-84

```typescript
export function grantsTargeting(block, kind, id) {
  const hits = (meta) => meta?.appliesTo?.kind === kind && meta.appliesTo.id === id;
  return {
    drawbacks: block.drawbacks.filter(d => hits(block.drawbackMeta?.[d])),
    boons: block.boons.filter(b => hits(block.boonMeta?.[b]))
  };
}
```

The read view:
- Iterates over EXISTING spheres/talents only (lines 686-700 in view-model.ts)
- For each existing entity, queries grantsTargeting with that entity's id
- grantsTargeting only returns exact id matches

If drawback targets deleted sphere-air:
- When querying for sphere-fire: drawback won't match (id != "sphere-fire")
- When querying for sphere-air: entity doesn't exist, query never happens
- Result: No false "affects here" flags, no crashes

**Result:** ✓ READ VIEW IS CORRECT AND SAFE

### 3. EDITOR BEHAVIOR - CONFIRMED ISSUE
**File:** `/components/character/editor/character-editor.tsx` lines 1391-1401

When displaying a drawback with stale appliesTo:
```typescript
const t = sp?.drawbackMeta?.[name]?.appliesTo;  // Line 1391
// If sphere-air was deleted, t = {kind: "sphere", id: "sphere-air"}

<SelectField
  value={t ? `${t.kind}:${t.id}` : ""}  // Line 1397
  // value will be "sphere:sphere-air"
  options={targetOptions}  // Line 1399
  // but targetOptions only includes existing spheres (lines 1194-1198)
/>
```

Result: SelectField has a value ("sphere:sphere-air") that doesn't match any option
→ The target appears **BLANK** to the user, orphaning the metadata

**Result:** ✓ EDITOR DISPLAYS STALE TARGET AS BLANK (SILENT ORPHANING)

### 4. CLEANUP BEHAVIOR - CONFIRMED
**File:** `/components/character/editor/character-editor.tsx` lines 1407-1414

When user REMOVES a drawback:
```typescript
onClick={() =>
  ensure((s) => {
    s.drawbacks.splice(i, 1);
    if (s.drawbackMeta) delete s.drawbackMeta[name];  // Line 1409 - cleanup!
  })
}
```

Cleanup happens:
- On explicit removal (line 1409, 1452)
- On target change (line 1009: meta[name] = {..., appliesTo: target})

Cleanup does NOT happen:
- Automatically after merge
- When navigating away
- After sphere deletion

**Result:** ✓ CLEANUP ONLY ON EXPLICIT EDIT/REMOVE, NOT AUTOMATIC

### 5. NO VALIDATION PASS - CONFIRMED
**File:** `/components/character/editor/use-character-editor.ts` lines 238-249

After 3-way merge:
```typescript
const { merged, conflicts } = threeWayMerge(baseSheet.current, latest, parsedServer.character);
// ... no cleanup or validation pass ...
commitDraft(merged);  // Uses merged document directly
```

No validation/cleanup pass after merge. Stale references persist.

**Result:** ✓ NO POST-MERGE VALIDATION, STALE REFERENCES PERSIST

## SAFETY ASSESSMENT

### What DOES NOT happen:
✓ No crash/error when reading the view
✓ No false "affects here" flags shown to users
✓ No data corruption or loss
✓ No invalid data persisted to database (schema is still valid)

### What DOES happen:
✗ Stale appliesTo metadata entry is preserved
✗ Target selector appears blank (undefined) to user
✗ Metadata is orphaned indefinitely (unless re-edited/removed)
✗ Silent zombie entry in drawbackMeta/boonMeta

## VERDICT: BENIGN BUT NOT IDEAL

The code is **functionally correct and safe**:
- Read view doesn't show false positives
- No crashes or data loss
- Database remains valid

However, it's **not ideal**:
- Leaves orphaned metadata entries
- Silent orphaning (no warning to user)
- Metadata persists until manually re-targeted or removed

## SUGGESTED IMPROVEMENTS (OPTIONAL)

Option A: Add post-merge cleanup pass
- After 3-way merge in use-character-editor.ts, validate all appliesTo references
- Remove appliesTo entries whose target id no longer exists in spheres/talents
- Minimal overhead, solves the issue completely

Option B: Accept as benign
- Document the edge case
- Rely on users to re-target or remove unused grants
- Current cleanup-on-edit catches most cases anyway

Option C: Hybrid
- Add cleanup only if drawbackMeta/boonMeta were actually merged (not all merges)
- Leaves the decision to the architecture
