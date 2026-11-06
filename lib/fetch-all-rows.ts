/** Read each API page, even when the server caps a page below the requested size. */
export async function fetchAllRows<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null; count: number | null }>, pageSize = 500): Promise<T[]> {
  const rows: T[] = [];
  let total: number | null = null;
  while (true) {
    const result = await fetchPage(rows.length, rows.length + pageSize - 1);
    if (result.error) throw new Error(result.error.message);
    total = result.count ?? total;
    const page = result.data ?? [];
    rows.push(...page);
    if (total !== null && rows.length >= total) return rows;
    if (page.length === 0) {
      if (total !== null && rows.length < total) throw new Error('Records changed while loading. Refresh to load the full list.');
      return rows;
    }
  }
}
