import type { PathForgeCharacterV1 } from "@pathforge/schema";

/**
 * Durable offline outbox (S5b Phase 2). When a save can't reach the server (offline), the
 * pending draft is persisted here so a refresh or crash doesn't lose the work; on reconnect
 * it's replayed through the same compare-and-swap + 3-way-merge path. One pending entry per
 * character (the latest draft supersedes earlier ones). localStorage-backed + SSR-safe.
 */
export type OutboxEntry = {
  /** The unsaved draft. */
  sheet: PathForgeCharacterV1;
  /** The last-synced sheet this draft diverged from — the merge base on reconnect. */
  baseSheet: PathForgeCharacterV1;
  /** The version that base corresponds to (the CAS expected-version). */
  baseVersion: number;
  /** The character schemaVersion when queued — entries from an older schema are discarded. */
  schemaVersion: string;
  /** Epoch ms the entry was queued (newest wins; useful for cleanup). */
  savedAt: number;
};

const keyFor = (characterId: string) => `pf:outbox:${characterId}`;

export function readOutbox(characterId: string): OutboxEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keyFor(characterId));
    return raw ? (JSON.parse(raw) as OutboxEntry) : null;
  } catch {
    return null;
  }
}

export function writeOutbox(characterId: string, entry: OutboxEntry): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyFor(characterId), JSON.stringify(entry));
  } catch {
    // Quota exceeded / private mode / disabled storage — degrade to in-memory only.
  }
}

export function clearOutbox(characterId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(keyFor(characterId));
  } catch {
    // ignore
  }
}
