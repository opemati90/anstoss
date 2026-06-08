/**
 * Deep-merge translation objects. Used to layer machine-generated locale
 * partials (src/i18n/generated/*) onto the hand-curated base locales without
 * editing the large base files by hand. `override` wins on leaf conflicts;
 * nested objects merge recursively.
 */
type Dict = { [k: string]: unknown }

export function deepMerge(base: Dict, override: Dict): Dict {
  const out: Dict = { ...base }
  for (const [key, value] of Object.entries(override)) {
    const existing = out[key]
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      existing &&
      typeof existing === 'object' &&
      !Array.isArray(existing)
    ) {
      out[key] = deepMerge(existing as Dict, value as Dict)
    } else {
      out[key] = value
    }
  }
  return out
}
