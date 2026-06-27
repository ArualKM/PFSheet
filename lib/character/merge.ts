import type { PathForgeCharacterV1 } from "@pathforge/schema";

/**
 * S5b Phase 0 spike — a pure, structural 3-way merge over the canonical character
 * document. This is the load-bearing primitive for concurrent-edit conflict handling
 * (desktop + mobile editing the same sheet without refreshing): given the last-synced
 * `base` and two divergent versions `mine` / `theirs`, produce a merged document plus
 * the list of true same-field conflicts that need a human decision.
 *
 * Design (see docs/S5b_NATIVE_APP_PLAN.md §4):
 * - The character is the SOURCE document only — computed stats are derived by
 *   `computeCharacter`, never stored — so the whole document is safe to merge.
 * - Disjoint edits auto-merge. A field changed on only one side takes that side.
 *   A field changed differently on both sides is a CONFLICT (we default to `mine`
 *   and record it for the UI / escalation).
 * - Entity arrays (elements are objects with a stable string `id`) merge BY ID, so
 *   concurrent adds/edits/removes of different entries never clobber by array index.
 * - Value arrays (primitives — tags, metamagicIds) merge as 3-way sets.
 * - Objects / records merge key-by-key.
 *
 * Pure + framework-free so it runs identically on web and in React Native (Hermes).
 * The merged result is plain data; callers should `parseCharacter()` it before persisting.
 * (Phase 1 moves this into the shared `@pathforge/view` package next to the view-model + diff.)
 */

export type MergeConflict = {
  /** Dotted path to the field, e.g. `identity.name` or `feats.list[id=abc].name`. */
  path: string;
  base: unknown;
  mine: unknown;
  theirs: unknown;
};

export type MergeResult<T> = {
  merged: T;
  conflicts: MergeConflict[];
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Key-order-independent deep equality (documents are JSON-ish: objects, arrays, primitives). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

/** An array whose elements are all objects with a stable string `id` — merge by id, not index. */
function isEntityArray(a: unknown): a is Array<Record<string, unknown> & { id: string }> {
  return (
    Array.isArray(a) &&
    a.length > 0 &&
    a.every((e) => isPlainObject(e) && typeof (e as Record<string, unknown>).id === "string")
  );
}

function indexById(arr: unknown[]): Map<string, Record<string, unknown>> {
  const m = new Map<string, Record<string, unknown>>();
  for (const e of arr) {
    if (isPlainObject(e) && typeof e.id === "string") m.set(e.id, e);
  }
  return m;
}

function mergeValue(
  base: unknown,
  mine: unknown,
  theirs: unknown,
  path: string,
  conflicts: MergeConflict[],
): unknown {
  // Both sides agree (covers "neither changed" and "both made the same change").
  if (deepEqual(mine, theirs)) return mine;
  // Only one side diverged from base — take the side that changed.
  if (deepEqual(mine, base)) return theirs;
  if (deepEqual(theirs, base)) return mine;

  // Both diverged differently. Recurse where the shape lets us isolate the real conflict.
  if (isPlainObject(mine) && isPlainObject(theirs)) {
    const baseObj = isPlainObject(base) ? base : {};
    return mergeObject(baseObj, mine, theirs, path, conflicts);
  }
  if (Array.isArray(mine) && Array.isArray(theirs)) {
    const baseArr = Array.isArray(base) ? base : [];
    return mergeArray(baseArr, mine, theirs, path, conflicts);
  }

  // Leaf scalar (or type mismatch) changed on both sides → genuine conflict.
  conflicts.push({ path, base, mine, theirs });
  return mine;
}

function mergeObject(
  base: Record<string, unknown>,
  mine: Record<string, unknown>,
  theirs: Record<string, unknown>,
  path: string,
  conflicts: MergeConflict[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)]);
  for (const k of keys) {
    const inMine = Object.prototype.hasOwnProperty.call(mine, k);
    const inTheirs = Object.prototype.hasOwnProperty.call(theirs, k);
    const childPath = path ? `${path}.${k}` : k;

    // Key deletion handling, symmetric with base.
    if (!inMine || !inTheirs) {
      const present = inMine ? mine[k] : theirs[k];
      const hadBase = Object.prototype.hasOwnProperty.call(base, k);
      if (!hadBase) {
        // Added on one side only → keep the addition.
        out[k] = present;
      } else if (deepEqual(present, base[k])) {
        // Other side deleted it and the present side didn't touch it → honor the delete.
        // (omit the key)
      } else {
        // One side edited, the other deleted → edit/delete conflict; keep the edit.
        conflicts.push({ path: childPath, base: base[k], mine: inMine ? mine[k] : undefined, theirs: inTheirs ? theirs[k] : undefined });
        out[k] = present;
      }
      continue;
    }
    out[k] = mergeValue(base[k], mine[k], theirs[k], childPath, conflicts);
  }
  return out;
}

function mergeArray(
  base: unknown[],
  mine: unknown[],
  theirs: unknown[],
  path: string,
  conflicts: MergeConflict[],
): unknown[] {
  // Entity arrays: merge by stable id so concurrent adds/edits/removes commute. An
  // emptied side (one user deleted every entry) is still entity-mode — so detect it from
  // whichever sides are non-empty, requiring no value/entity mixing.
  const sides = [base, mine, theirs];
  const entityMode = sides.some(isEntityArray) && sides.every((a) => a.length === 0 || isEntityArray(a));
  if (entityMode) {
    const baseItems = indexById(base);
    const mineItems = indexById(mine);
    const theirItems = indexById(theirs);

    // Deterministic order: mine's order first, then theirs-only additions.
    const order: string[] = [];
    const seen = new Set<string>();
    for (const e of mine) {
      const id = (e as { id: string }).id;
      if (!seen.has(id)) { order.push(id); seen.add(id); }
    }
    for (const e of theirs) {
      const id = (e as { id: string }).id;
      if (!seen.has(id)) { order.push(id); seen.add(id); }
    }

    const out: unknown[] = [];
    for (const id of order) {
      const b = baseItems.get(id);
      const m = mineItems.get(id);
      const t = theirItems.get(id);
      const itemPath = `${path}[id=${id}]`;

      if (m && t) {
        out.push(mergeValue(b, m, t, itemPath, conflicts));
      } else if (m && !t) {
        // theirs lacks it: either an add by mine (no base) or a delete by theirs.
        if (!b) out.push(m);
        else if (deepEqual(m, b)) { /* theirs deleted, mine untouched → drop */ }
        else { conflicts.push({ path: itemPath, base: b, mine: m, theirs: undefined }); out.push(m); }
      } else if (!m && t) {
        if (!b) out.push(t);
        else if (deepEqual(t, b)) { /* mine deleted, theirs untouched → drop */ }
        else { conflicts.push({ path: itemPath, base: b, mine: undefined, theirs: t }); out.push(t); }
      }
      // (!m && !t): deleted on both sides → drop.
    }
    return out;
  }

  // Value arrays (primitives): 3-way set merge keyed on the value itself.
  const key = (v: unknown) => JSON.stringify(v);
  const baseKeys = new Set(base.map(key));
  const mineKeys = new Set(mine.map(key));
  const theirKeys = new Set(theirs.map(key));
  const removed = new Set<string>();
  for (const k of baseKeys) {
    if (!mineKeys.has(k) || !theirKeys.has(k)) removed.add(k);
  }
  const out: unknown[] = [];
  const emitted = new Set<string>();
  const emit = (v: unknown) => {
    const k = key(v);
    if (removed.has(k) || emitted.has(k)) return;
    emitted.add(k);
    out.push(v);
  };
  for (const v of base) emit(v);
  for (const v of mine) emit(v);
  for (const v of theirs) emit(v);
  return out;
}

/**
 * Three-way merge two divergent character documents against their last-synced base.
 * Returns the merged document and any true same-field conflicts (empty array = a clean,
 * fully-automatic merge). Callers persist `merged` only after `parseCharacter()` validates it.
 */
// --- Per-field conflict resolution -----------------------------------------------------

type PathToken = { key: string } | { id: string };

/** Parse a merge-conflict path like `feats.list[id=f-x].notes` into navigable tokens. */
function parsePath(path: string): PathToken[] {
  const tokens: PathToken[] = [];
  const re = /([^.[\]]+)|\[id=([^\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) {
    if (m[2] !== undefined) tokens.push({ id: m[2] });
    else if (m[1] !== undefined) tokens.push({ key: m[1] });
  }
  return tokens;
}

/**
 * Set (or, with value === undefined, delete) the value at a conflict path on a mutable doc.
 * Handles both object keys and `[id=…]` array-entry selectors. Silently no-ops if the parent
 * path doesn't resolve (the structure changed out from under the conflict).
 */
function setAtPath(root: unknown, path: string, value: unknown): void {
  const tokens = parsePath(path);
  if (tokens.length === 0) return;
  let cur: unknown = root;
  for (let i = 0; i < tokens.length - 1; i++) {
    const t = tokens[i]!;
    if ("id" in t) {
      cur = Array.isArray(cur) ? cur.find((e) => isPlainObject(e) && e.id === t.id) : undefined;
    } else {
      cur = isPlainObject(cur) ? cur[t.key] : undefined;
    }
    if (cur == null) return;
  }
  const last = tokens[tokens.length - 1]!;
  if ("id" in last) {
    if (!Array.isArray(cur)) return;
    const idx = cur.findIndex((e) => isPlainObject(e) && e.id === last.id);
    if (value === undefined) {
      if (idx >= 0) cur.splice(idx, 1);
    } else if (idx >= 0) {
      cur[idx] = value;
    } else {
      cur.push(value); // the chosen side re-adds an entry the other deleted
    }
  } else if (isPlainObject(cur)) {
    if (value === undefined) delete cur[last.key];
    else cur[last.key] = value;
  }
}

export type ConflictChoice = "mine" | "theirs";

/**
 * Apply per-field conflict choices to the auto-merged document. Starts from `merged` (disjoint
 * edits already reconciled) and, for each conflict, forces the chosen side's value at that path
 * — so "mine" on a delete actually deletes, and "theirs" on an edit takes their value. Unlisted
 * conflicts default to "mine". Pure; returns a new document (validate before persisting).
 */
export function applyConflictChoices(
  merged: PathForgeCharacterV1,
  conflicts: MergeConflict[],
  choices: Record<string, ConflictChoice>,
): PathForgeCharacterV1 {
  const result = structuredClone(merged) as unknown;
  for (const c of conflicts) {
    const choice = choices[c.path] ?? "mine";
    setAtPath(result, c.path, choice === "theirs" ? c.theirs : c.mine);
  }
  return result as PathForgeCharacterV1;
}

export function threeWayMerge(
  base: PathForgeCharacterV1,
  mine: PathForgeCharacterV1,
  theirs: PathForgeCharacterV1,
): MergeResult<PathForgeCharacterV1> {
  const conflicts: MergeConflict[] = [];
  const merged = mergeObject(
    base as unknown as Record<string, unknown>,
    mine as unknown as Record<string, unknown>,
    theirs as unknown as Record<string, unknown>,
    "",
    conflicts,
  ) as unknown as PathForgeCharacterV1;
  return { merged, conflicts };
}
