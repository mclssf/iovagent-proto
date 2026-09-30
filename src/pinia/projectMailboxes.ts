import type { Project, ProjectMailbox } from '@/views/AgentWork/interface';
import type { DailyTask } from '@/views/AgentWork/dailyTasks';

export const mailboxSkill = {
  id: 'operations-email-connection',
  name: '邮箱连接',
  description: '接收客户订单邮件，识别运输需求并自动回复',
};
export const emailDemoMailbox = 'orders@iov-demo.example.com';
const projectsKey = 'iovagent-mailbox-projects-v1';
const tasksKey = 'iovagent-mailbox-tasks-v1';
type SavedMailboxProject = Omit<Project, 'tmsUrl' | 'tmsUser'>;

export function createProjectMailbox(): ProjectMailbox {
  return { address: emailDemoMailbox, status: 'bound', boundAt: Date.now() };
}

function readStoredList<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    return Array.isArray(saved) ? saved as T[] : [];
  } catch { return []; }
}

function writeStoredList(key: string, items: unknown[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(items));
}

export function restoreMailboxProjects(seeds: Project[]): Project[] {
  const projects: Project[] = seeds.map(project => ({ ...project, skillIds: [...(project.skillIds ?? [])], mailbox: project.mailbox ? { ...project.mailbox } : undefined }));
  for (const saved of readStoredList<SavedMailboxProject>(projectsKey)) {
    if (!saved || typeof saved.id !== 'string' || typeof saved.name !== 'string' || !Array.isArray(saved.skillIds) || saved.mailbox?.status !== 'bound' || typeof saved.mailbox.address !== 'string') continue;
    const index = projects.findIndex(project => project.id === saved.id);
    const previous = projects[index];
    const restored: Project = { ...saved, tmsUrl: previous?.tmsUrl ?? '项目技能', tmsUser: previous?.tmsUser ?? 'skill_agent' };
    if (index >= 0) projects[index] = restored;
    else projects.push(restored);
  }
  return projects;
}

export function persistMailboxProjects(projects: Project[]) {
  // Save only mailbox-enabled project context; system addresses and credentials stay out.
  writeStoredList(projectsKey, projects.filter(project => project.mailbox?.status === 'bound').map(project => ({
    id: project.id, name: project.name, status: project.status, sync: project.sync,
    total: project.total, risk: project.risk, keyword: project.keyword, statusFilter: project.statusFilter,
    skillIds: project.skillIds, mailbox: project.mailbox,
  })));
}

export function restoreMailboxTasks(): DailyTask[] {
  return readStoredList<DailyTask>(tasksKey).filter(task => task?.taskTemplate === 'email-order' && typeof task.projectId === 'string' && Array.isArray(task.runs) && task.mailbox?.status === 'bound');
}

export function persistMailboxTasks(tasks: DailyTask[]) {
  writeStoredList(tasksKey, tasks.filter(task => task.taskTemplate === 'email-order'));
}
