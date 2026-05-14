export type FlatRow = Record<string, string | number | boolean>;

export function flattenRow(row: Record<string, unknown>): FlatRow {
  const out: FlatRow = {};
  for (const k of Object.keys(row)) {
    const v = row[k];
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) {
      out[k] = JSON.stringify(v);
    } else if (typeof v === "object") {
      const obj = v as Record<string, unknown>;
      const subKeys = Object.keys(obj);
      if (subKeys.length === 0) continue;
      for (const sk of subKeys) {
        const sv = obj[sk];
        if (sv === null || sv === undefined) continue;
        if (Array.isArray(sv) || (typeof sv === "object" && sv !== null)) {
          out[`${k}_${sk}`] = JSON.stringify(sv);
        } else {
          out[`${k}_${sk}`] = sv as string | number | boolean;
        }
      }
    } else {
      out[k] = v as string | number | boolean;
    }
  }
  return out;
}
