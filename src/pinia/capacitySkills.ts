// Legacy customer and project grants are normalized at read/save boundaries.
const replacements: Record<string, string> = {
  'capacity-find-carrier': 'capacity-cargo-publish',
  'capacity-quote-query': 'capacity-quote-collection',
  'capacity-cargo-search': 'capacity-cargo-normalization',
};
export function migrateCapacitySkillIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map(id => replacements[id] ?? id))];
}
