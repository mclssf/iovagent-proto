import type { Project } from '@/views/AgentWork/interface';
import { phaseSkills } from './catalog';

const key = 'iovagent-monitoring-projects';
type SavedProject = Pick<Project, 'id' | 'name' | 'status' | 'sync' | 'total' | 'risk' | 'keyword' | 'statusFilter' | 'skillIds' | 'authorizedDataSkillIds'>;
function read() {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return {
      projects: (Array.isArray(value?.projects) ? value.projects : []).filter((project: SavedProject) => project && typeof project.id === 'string' && typeof project.name === 'string' && typeof project.status === 'string' && typeof project.sync === 'string' && Number.isFinite(project.total) && Number.isFinite(project.risk) && typeof project.keyword === 'string' && typeof project.statusFilter === 'string' && Array.isArray(project.skillIds) && project.skillIds.every(id => typeof id === 'string') && (project.authorizedDataSkillIds === undefined || Array.isArray(project.authorizedDataSkillIds) && project.authorizedDataSkillIds.every(id => typeof id === 'string'))).map(({ id, name, status, sync, total, risk, keyword, statusFilter, skillIds, authorizedDataSkillIds }: SavedProject): SavedProject => ({ id, name, status, sync, total, risk, keyword, statusFilter, skillIds: [...(skillIds ?? [])], ...(authorizedDataSkillIds ? { authorizedDataSkillIds: [...authorizedDataSkillIds] } : {}) })),
      removed: (Array.isArray(value.removed) ? value.removed : []).filter((id: unknown) => typeof id === 'string') as string[],
    };
  } catch { return { projects: [] as SavedProject[], removed: [] as string[] }; }
}
export function restoreMonitoringProjects(seeds: Project[]): Project[] {
  const saved = read();
  const projects = seeds.filter(project => !saved.removed.includes(project.id));
  for (const project of saved.projects) {
    if (saved.removed.includes(project.id)) continue;
    const index = projects.findIndex(item => item.id === project.id);
    const original = projects[index];
    const restored = { ...original, ...project, tmsUrl: original?.tmsUrl ?? '', tmsUser: original?.tmsUser ?? '' };
    if (index >= 0) projects[index] = restored;
    else projects.push(restored);
  }
  return projects;
}
export function persistMonitoringProjects(projects: Project[]) {
  const previous = read();
  const retained = new Set(previous.projects.map(project => project.id));
  const removed = new Set(previous.removed);
  previous.projects.filter(project => !projects.some(item => item.id === project.id)).forEach(project => removed.add(project.id));
  const saved = projects.filter(project => retained.has(project.id) || project.skillIds?.some(id => phaseSkills.some(skill => skill.id === id))).map(({ id, name, status, sync, total, risk, keyword, statusFilter, skillIds, authorizedDataSkillIds }): SavedProject => ({ id, name, status, sync, total, risk, keyword, statusFilter, skillIds: [...(skillIds ?? [])], ...(authorizedDataSkillIds ? { authorizedDataSkillIds: [...authorizedDataSkillIds] } : {}) }));
  saved.forEach(project => removed.delete(project.id));
  try { localStorage.setItem(key, JSON.stringify({ projects: saved, removed: [...removed] })); return true; }
  catch { return false; }
}
