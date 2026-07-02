import { describe, it, expect } from "vitest";
import { fetchAllRows } from "@/lib/character/fetch-all-rows";

/**
 * The paged full-table loader behind the veil/maneuver pickers. PostgREST caps ONE response at
 * the server's max-rows (1,000 on prod) — a flat `.limit(2000)` silently truncated the 1,332-row
 * veil compendium to exactly 1,000 rows, making 332 veils unreachable in the picker. fetchAllRows
 * pages via `.range()` until a short page.
 */
describe("fetchAllRows", () => {
  const source = (total: number) => Array.from({ length: total }, (_, i) => ({ n: i }));

  const pager = (rows: Array<{ n: number }>, failFrom?: number) => {
    const calls: Array<[number, number]> = [];
    const page = async (from: number, to: number) => {
      calls.push([from, to]);
      if (failFrom != null && from >= failFrom) return { data: null, error: { message: "boom" } };
      return { data: rows.slice(from, to + 1), error: null };
    };
    return { page, calls };
  };

  it("concatenates pages in order until a short page (the 1,332-row veil-compendium case)", async () => {
    const rows = source(1332);
    const { page, calls } = pager(rows);
    const res = await fetchAllRows(page, 1000);
    expect(res.error).toBeNull();
    expect(res.rows).toEqual(rows); // order preserved, nothing dropped past row 1,000
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("a sub-cap table resolves in a single request (the 758-row maneuver compendium)", async () => {
    const { page, calls } = pager(source(758));
    const res = await fetchAllRows(page, 1000);
    expect(res.rows).toHaveLength(758);
    expect(calls).toEqual([[0, 999]]);
  });

  it("an exact page-multiple total probes one extra empty page and terminates", async () => {
    const { page, calls } = pager(source(2000));
    const res = await fetchAllRows(page, 1000);
    expect(res.rows).toHaveLength(2000);
    expect(calls).toHaveLength(3); // 1000 + 1000 + 0 — never loops
  });

  it("an empty table yields no rows and no error", async () => {
    const { page } = pager(source(0));
    expect(await fetchAllRows(page, 1000)).toEqual({ rows: [], error: null });
  });

  it("a page error aborts and propagates (callers fail soft like a single-request error)", async () => {
    const { page } = pager(source(1500), 1000);
    const res = await fetchAllRows(page, 1000);
    expect(res.error).toEqual({ message: "boom" });
  });
});
