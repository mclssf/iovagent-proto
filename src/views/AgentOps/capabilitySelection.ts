import type { SkillGroup, ToolKind } from '@/pinia/agentOps';

export interface CapabilityOption {
  id: string;
  name: string;
  description: string;
  group?: SkillGroup;
  kind?: ToolKind;
  disabled?: boolean;
  detail?: string;
  warning?: string;
}

export function filterCapabilityOptions(items: readonly CapabilityOption[], search: string, groups: readonly SkillGroup[], kind: 'all' | ToolKind) {
  const query = search.trim().toLowerCase();
  return items.filter(item => (!groups.length || (item.group && groups.includes(item.group)))
    && (kind === 'all' || item.kind === kind)
    && (!query || `${item.name} ${item.id} ${item.description} ${item.group ?? ''}`.toLowerCase().includes(query)));
}

// Adding from a filtered picker preserves existing grants and rejects stale or disabled candidates.
export function mergeCapabilitySelection(currentIds: readonly string[], additions: readonly string[], items: readonly CapabilityOption[]) {
  const eligible = new Set(items.filter(item => !item.disabled).map(item => item.id));
  return [...new Set([...currentIds, ...additions.filter(id => eligible.has(id))])];
}
