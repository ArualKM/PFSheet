/**
 * Page a PostgREST query until a short page. Supabase/PostgREST hard-caps a single response at
 * the server's max-rows setting (1,000 on prod) — `.limit(N)` with N above the cap SILENTLY
 * truncates (the 1,332-row akashic veil compendium came back as exactly 1,000 rows, dropping the
 * alphabetical tail). Full-table picker loads must therefore `.range()` in pages and concatenate.
 *
 * `page(from, to)` must return the SAME query with `.range(from, to)` applied and a DETERMINISTIC
 * total order (e.g. `.order("name").order("slug")` — a unique tiebreaker) so consecutive pages
 * neither skip nor duplicate rows. Stops at the first page shorter than `pageSize`; a page error
 * aborts and is returned (callers fail soft exactly like a single-request error).
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<{ rows: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) return { rows, error };
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return { rows, error: null };
  }
}
