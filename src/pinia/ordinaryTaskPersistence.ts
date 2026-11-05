import type { DailyTask } from '@/views/AgentWork/dailyTasks';
import type { Project } from '@/views/AgentWork/interface';

export const ordinaryTasksStorageKey = 'iovagent-ordinary-tasks-v2';

export function restoreOrdinaryTasks(): DailyTask[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(ordinaryTasksStorageKey) ?? '[]');
    const tasks: DailyTask[] = Array.isArray(saved) ? saved.filter(task => ['once', 'email'].includes(task?.trigger) && typeof task.id === 'string' && typeof task.prompt === 'string' && Array.isArray(task.runs)) : [];
    try {
      const legacy: unknown = JSON.parse(window.localStorage.getItem('iovagent-mailbox-tasks-v1') ?? '[]');
      if (Array.isArray(legacy)) {
        for (const task of legacy) {
          if (task?.taskTemplate === 'email-order' && typeof task.id === 'string' && task.projectId && task.mailbox?.status === 'bound' && Array.isArray(task.runs) && !tasks.some(item => item.id === task.id)) tasks.push({ ...task, trigger: 'email' });
        }
      }
    } catch { /* A corrupt legacy mailbox snapshot must not discard current tasks. */ }
    return tasks;
  } catch { return []; }
}

export function restoreOrdinaryTaskProjects(projects: Project[]): Project[] {
  const result = [...projects];
  for (const task of restoreOrdinaryTasks()) {
    const context = task.projectContext;
    if (!context || context.id !== task.projectId || typeof context.name !== 'string' || result.some(project => project.id === context.id)) continue;
    result.push({ ...context, skillIds: [...(context.skillIds ?? [])], tmsUrl: '项目技能', tmsUser: 'skill_agent' });
  }
  return result;
}
