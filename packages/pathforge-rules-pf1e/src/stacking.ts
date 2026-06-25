import type { BonusType } from "@pathforge/schema";

/**
 * §7 Bonus stacking engine.
 *
 * Default PF1e behavior:
 *  - Same typed bonuses do not stack; keep the highest.
 *  - Dodge bonuses stack.
 *  - Circumstance bonuses may stack (different circumstances → different groups).
 *  - Untyped bonuses stack unless they share a source / stacking group.
 *  - Penalties generally stack (dedupe only within an explicit group).
 *  - Custom content overrides stacking by assigning a stackingGroup.
 */

export type StackInput = {
  id: string;
  label: string;
  value: number;
  bonusType?: BonusType;
  source?: string;
  stackingGroup?: string;
  enabled?: boolean;
};

export type StackEntry = StackInput & {
  included: boolean;
  reason?: string;
};

export type StackResult = {
  total: number;
  entries: StackEntry[];
};

/** Bonus types that stack with themselves by default. */
const STACKING_TYPES = new Set<BonusType>(["dodge", "circumstance", "untyped"]);

let uniqueCounter = 0;
function uniqueKey(prefix: string): string {
  uniqueCounter += 1;
  return `${prefix}#${uniqueCounter}`;
}

function isPenalty(m: StackInput): boolean {
  return m.value < 0 || m.bonusType === "penalty";
}

export function applyStacking(mods: StackInput[]): StackResult {
  const entries: StackEntry[] = [];

  const enabled: StackInput[] = [];
  for (const m of mods) {
    if (m.enabled === false) {
      entries.push({ ...m, included: false, reason: "Disabled" });
    } else {
      enabled.push(m);
    }
  }

  // Bucket by stacking key. Best entry per key wins; the rest are suppressed.
  type Bucket = {
    mode: "max" | "min";
    type: BonusType | "untyped";
    /** True when the bucket key came from an explicit stackingGroup. */
    isGroup: boolean;
    items: StackInput[];
  };
  const buckets = new Map<string, Bucket>();

  for (const m of enabled) {
    const type: BonusType | "untyped" = m.bonusType ?? "untyped";
    const penalty = isPenalty(m);
    const stacks = penalty || STACKING_TYPES.has(type as BonusType);
    const isGroup = m.stackingGroup != null;
    // Stacking entries with no explicit group each get a unique key (all kept).
    const key = m.stackingGroup ?? (stacks ? uniqueKey(type) : type);
    const mode: "max" | "min" = penalty ? "min" : "max";

    const bucket = buckets.get(key);
    if (bucket) {
      bucket.items.push(m);
    } else {
      buckets.set(key, { mode, type, isGroup, items: [m] });
    }
  }

  const pickBest = (items: StackInput[], mode: "max" | "min"): StackInput | null => {
    let best: StackInput | null = null;
    for (const item of items) {
      if (!best || (mode === "max" ? item.value > best.value : item.value < best.value)) {
        best = item;
      }
    }
    return best;
  };

  let total = 0;
  for (const bucket of buckets.values()) {
    const survivors = new Set<StackInput>();
    if (bucket.isGroup) {
      // Within an explicit stacking group, a non-stacking bonus and a penalty are
      // independent: keep the highest bonus AND the most-negative penalty and sum
      // both. Order-independent and correct for mixed-sign custom content.
      const bestPos = pickBest(
        bucket.items.filter((i) => i.value >= 0),
        "max",
      );
      const bestNeg = pickBest(
        bucket.items.filter((i) => i.value < 0),
        "min",
      );
      if (bestPos) survivors.add(bestPos);
      if (bestNeg) survivors.add(bestNeg);
    } else {
      const best = pickBest(bucket.items, bucket.mode);
      if (best) survivors.add(best);
    }

    for (const item of bucket.items) {
      if (survivors.has(item)) {
        entries.push({ ...item, included: true });
        total += item.value;
      } else {
        const label = item.value < 0 ? "larger penalty" : `higher ${bucket.type} bonus`;
        entries.push({ ...item, included: false, reason: `Superseded by ${label}` });
      }
    }
  }

  return { total, entries };
}
