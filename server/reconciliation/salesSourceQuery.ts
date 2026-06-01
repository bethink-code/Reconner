/**
 * Scope a fuel-shaped read query to a vertical's sales side.
 *
 * The summary/coverage SQL is written with `source_type = 'fuel'`. For the fuel vertical we return
 * the query byte-for-byte unchanged (so fuel can never regress), and for any other vertical we swap
 * in its sales source type. `salesSourceType` is a vertical-adapter enum resolved server-side (never
 * client input); it is still guarded before interpolation as defence-in-depth against SQL injection.
 *
 * Only `source_type = 'fuel'` is rewritten — `source_type LIKE 'bank%'` (the generic bank side) is
 * left intact.
 */
export function scopeToSalesSource(query: string, salesSourceType: string): string {
  if (salesSourceType === "fuel") return query;
  if (!/^[a-z_]+$/.test(salesSourceType)) {
    throw new Error(`Unsupported sales source type: ${salesSourceType}`);
  }
  return query.replace(/source_type = 'fuel'/g, `source_type = '${salesSourceType}'`);
}
