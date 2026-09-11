import type { AgentCallableSkill, SkillGroup } from './agentOps';

export interface CustomerAgentBinding { agentId: string; skillIds: string[]; toolIds: string[]; }
export interface CustomerAgentTarget { customerId: string; agentId: string; }
export interface ActivatedCustomer {
  id: string;
  name: string;
  cid: string;
  contractStart: string;
  contractEnd: string;
  activationType: '试用' | '正式';
  agentConfigs: CustomerAgentBinding[];
  updatedAt: string;
  updatedBy: string;
}

/** Batch selection saves a snapshot. New or regrouped Skills never change an existing grant. */
export function selectSkillGroup(ids: readonly string[], group: SkillGroup, catalog: readonly AgentCallableSkill[], selected: boolean): string[] {
  const members = catalog.filter((skill) => skill.group === group);
  return selected
    ? [...new Set([...ids, ...members.filter((skill) => skill.enabled).map((skill) => skill.id)])]
    : ids.filter((id) => !members.some((skill) => skill.id === id));
}

// Activation records are local demo data; contract properties are display-only here.
export function createActivatedCustomers(): ActivatedCustomer[] {
  const general = (): CustomerAgentBinding => ({ agentId: 'general-chat-agent', skillIds: ['operations-logistics-sheet', 'operations-license-recognition'], toolIds: ['datetime-format'] });
  const project = (): CustomerAgentBinding => ({ agentId: 'project-chat-agent', skillIds: ['route-risk-expert', 'gps-trace-expert', 'delivery-sla-expert'], toolIds: [] });
  const employee = (id?: string): CustomerAgentBinding => ({ agentId: 'data-employee-agent', skillIds: ['spreadsheet-waybill', ...(id ? [id] : [])], toolIds: [] });
  const rows: Array<[string, string, string, string, string, '试用' | '正式', CustomerAgentBinding[]]> = [
    ['ent-jinyu', '金隅水泥', 'CID00000201', '2026-01-01', '2026-12-31', '正式', [employee('jinyu-cement-tms'), general(), project()]],
    ['ent-tsingtao', '青岛啤酒', 'CID00000202', '2026-04-01', '2027-03-31', '正式', [employee(), general(), project()]],
    ['ent-jinmailang', '今麦郎', 'CID00000203', '2026-06-01', '2027-05-31', '正式', [employee('jinmailang-logistics'), project()]],
    ['ent-anjie', '安捷物流', 'CID00000204', '2026-09-01', '2026-09-30', '试用', [general(), project()]],
    ['ent-zhilian', '智链顺达', 'CID00000205', '2026-03-01', '2027-02-28', '正式', [employee('zhilian-shunda-tms'), general(), project()]],
    ['ent-east', '华东物流事业部', 'CID00000206', '2026-07-01', '2027-06-30', '正式', [employee(), project()]],
    ['ent-southwest', '西南供应链中心', 'CID00000207', '2026-09-05', '2026-10-04', '试用', [general()]],
    ['ent-demo', '演示企业', 'CID00000208', '2026-09-01', '2026-09-30', '试用', []],
  ];
  return rows.map(([id, name, cid, contractStart, contractEnd, activationType, agentConfigs]) => ({
    id, name, cid, contractStart, contractEnd, activationType, agentConfigs, updatedAt: '2026-09-11 09:00', updatedBy: '系统管理员',
  }));
}
