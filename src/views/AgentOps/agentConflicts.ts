import type { AgentConfig, ManagedSkill, ManagedTool, ToolParameter } from '@/pinia/agentOps';

export interface AgentCatalog {
  skills: readonly ManagedSkill[];
  tools: readonly ManagedTool[];
  globalToolIds: readonly string[];
}
export interface ToolLoadPath { kind: 'direct' | 'global' | 'private'; label: string; skillId?: string; }
export interface AgentToolUsage { id: string; tool?: ManagedTool; paths: ToolLoadPath[]; }
export interface AgentFinding {
  id: string;
  kind: 'duplicate' | 'intent' | 'schema' | 'configuration';
  severity: 'high' | 'review';
  title: string;
  paths: string[];
  evidence: string[];
  suggestion: string;
}
export interface AgentConflictReport {
  fingerprint: string;
  checkedAt: string;
  findings: AgentFinding[];
  coverage: string[];
  skillCount: number;
  toolCount: number;
  candidateCount: number;
  schemaCount: number;
}

export function resolveAgentTools(agent: AgentConfig, catalog: AgentCatalog): AgentToolUsage[] {
  const usages = new Map<string, AgentToolUsage>();
  const add = (id: string, path: ToolLoadPath) => {
    if (!usages.has(id)) usages.set(id, { id, tool: catalog.tools.find((tool) => tool.id === id), paths: [] });
    const usage = usages.get(id)!;
    if (!usage.paths.some((item) => item.kind === path.kind && item.skillId === path.skillId)) usage.paths.push(path);
  };
  agent.toolIds.forEach((id) => add(id, { kind: 'direct', label: 'Agent 直接加载' }));
  catalog.globalToolIds.forEach((id) => add(id, { kind: 'global', label: '全局加载' }));
  catalog.skills.filter((skill) => agent.skillIds.includes(skill.id) && skill.enabled).forEach((skill) => {
    skill.privateToolIds.forEach((id) => add(id, { kind: 'private', skillId: skill.id, label: `Skill「${skill.name}」私有加载` }));
  });
  return [...usages.values()];
}

export function agentConfigurationFingerprint(agent: AgentConfig, catalog: AgentCatalog): string {
  const sortIds = (ids: readonly string[]) => [...new Set(ids)].sort();
  const usages = resolveAgentTools(agent, catalog);
  return JSON.stringify({
    name: agent.name, systemPrompt: agent.systemPrompt, skillIds: sortIds(agent.skillIds), toolIds: sortIds(agent.toolIds),
    globalToolIds: sortIds(catalog.globalToolIds),
    skills: catalog.skills.filter((skill) => agent.skillIds.includes(skill.id)).map((skill) => ({
      id: skill.id, name: skill.name, description: skill.description, content: skill.content, enabled: skill.enabled,
      privateToolIds: sortIds(skill.privateToolIds), visibility: skill.visibility, enterpriseIds: sortIds(skill.enterpriseIds),
    })).sort((a, b) => a.id.localeCompare(b.id)),
    tools: usages.map((usage) => ({ id: usage.id, tool: usage.tool })).sort((a, b) => a.id.localeCompare(b.id)),
  });
}

interface Candidate {
  id: string;
  label: string;
  description: string;
  ownerId: string;
  skillId?: string;
  paths: string[];
  inputs?: readonly ToolParameter[];
  outputs?: readonly ToolParameter[];
}

// Local demo rules identify action + business object, not a generic shared word.
const intentRules: Array<{ name: string; pattern: RegExp }> = [
  { name: '查询车辆位置', pattern: /车辆定位查询|查询车辆.{0,4}位置|get_vehicle_location/ },
  { name: '查询行驶轨迹', pattern: /轨迹查询|查询车辆.{0,5}轨迹|查询车辆历史行驶轨迹|get_vehicle_trace/ },
  { name: '核验轨迹真实性', pattern: /轨迹真实性|轨迹断点|速度跳变|定位漂移/ },
  { name: '评估在途风险', pattern: /在途风险专家|在途风险评估|识别.{0,6}在途风险|输出风险等级/ },
  { name: '识别异常停车', pattern: /异常停车|停车事件分类|合理停车|高风险长停/ },
  { name: '预测到达时间', pattern: /到货时效|预计到达时间|到达时间预测/ },
  { name: '规划运输路线', pattern: /路线规划|规划运输路线|生成可行运输路线/ },
  { name: '补充运单字段', pattern: /运单.{0,3}补充|补充缺失字段/ },
  { name: '校验运单字段', pattern: /运单纠错|运单规则校验|校验运单字段/ },
  { name: '生成运营表格', pattern: /物流表格|运营表格生成|生成.{0,8}台账/ },
  { name: '发送短信通知', pattern: /短信通知|短信发送|send_sms/ },
  { name: '查询物流天气', pattern: /物流天气|天气预报|气象预警|get_weather|get_route_alerts/ },
  { name: '识别证照字段', pattern: /证照识别|证照字段识别|识别驾驶证/ },
  { name: '发布货源找运力', pattern: /找运力|货源信息发布|(?<!已)发布货源|publish_cargo/ },
  { name: '查询运力报价', pattern: /报价查询|查询.{0,10}报价|query_quotes/ },
  { name: '检索货源', pattern: /搜索货源|搜索平台已发布|检索已发布货源|search_cargo/ },
  { name: '查询私有运力', pattern: /私有运力池|查询当前企业自有|query_private_fleet/ },
];

const normalize = (text: string) => text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
function textSimilarity(a: string, b: string) {
  const grams = (text: string) => {
    const value = normalize(text);
    return new Set(Array.from({ length: Math.max(0, value.length - 1) }, (_, i) => value.slice(i, i + 2)));
  };
  const left = grams(a), right = grams(b);
  if (!left.size || !right.size) return 0;
  return [...left].filter((value) => right.has(value)).length / Math.min(left.size, right.size);
}
function commonParameters(a: readonly ToolParameter[] = [], b: readonly ToolParameter[] = []) {
  return a.filter((param) => b.some((other) => param.name === other.name && param.type === other.type)).map((param) => `${param.name}: ${param.type}`);
}

export function analyzeAgentConflicts(agent: AgentConfig, catalog: AgentCatalog): AgentConflictReport {
  const findings: AgentFinding[] = [];
  const coverage: string[] = [];
  const usages = resolveAgentTools(agent, catalog);
  const selectedSkills = catalog.skills.filter((skill) => agent.skillIds.includes(skill.id));
  const activeSkills = selectedSkills.filter((skill) => skill.enabled);
  const candidates: Candidate[] = [];
  const configIssue = (id: string, title: string, evidence: string, suggestion: string) => findings.push({
    id, kind: 'configuration', severity: 'review', title, paths: [agent.name], evidence: [evidence], suggestion,
  });
  if (!agent.systemPrompt.trim()) configIssue('empty-prompt', 'System Prompt 为空', '缺少 Agent 的职责和调用约束。', '补充职责、意图边界和调用优先级。');
  for (const id of new Set(agent.skillIds)) {
    const skill = selectedSkills.find((item) => item.id === id);
    if (!skill) configIssue(`missing-skill-${id}`, '存在失效的 Skill 配置', `Skill ${id} 已不在目录中。`, '移除失效引用或在 Skill 管理中恢复配置。');
    else if (!skill.enabled) configIssue(`disabled-skill-${id}`, `Skill「${skill.name}」已停用`, '本次有效调用范围不包含该 Skill 及其私有工具。', '检查 Skill 状态，或从 Agent 配置中移除。');
  }
  for (const skill of activeSkills) {
    candidates.push({ id: `skill:${skill.id}`, ownerId: skill.id, skillId: skill.id, label: `Skill「${skill.name}」`, description: `${skill.name} ${skill.description}`, paths: [`Agent → Skill「${skill.name}」`] });
    coverage.push(`Skill「${skill.name}」未声明输入、输出 Schema，已检查名称、功能描述与私有工具路径。`);
    if (skill.visibility === '指定企业') coverage.push(`Skill「${skill.name}」仅对指定企业可见；本次按配置范围检测，实际可用范围仍遵循企业权限。`);
  }
  for (const usage of usages) {
    const tool = usage.tool;
    if (!tool) {
      configIssue(`missing-tool-${usage.id}`, '存在失效的 Tool 配置', `${usage.id} 来源：${usage.paths.map((path) => path.label).join('、')}。`, '检查对应配置入口并移除失效引用。');
      continue;
    }
    const privatePaths = usage.paths.filter((path) => path.kind === 'private');
    const exposedPaths = usage.paths.filter((path) => path.kind !== 'private');
    if ((privatePaths.length && exposedPaths.length) || exposedPaths.length > 1) {
      findings.push({
        id: `duplicate-${tool.id}`, kind: 'duplicate', severity: privatePaths.length ? 'high' : 'review',
        title: `${tool.name}存在多条加载路径`,
        paths: usage.paths.map((path) => `Agent → ${path.label} → ${tool.name}`),
        evidence: [`同一 Tool（${tool.id}）同时通过${usage.paths.map((path) => path.label).join('、')}可达。`, privatePaths.length ? 'Agent 可绕过 Skill 直接选择该工具，可能跳过 Skill 的执行指引。' : 'Agent 直接加载与全局加载重复；两项配置仍各自独立。'],
        suggestion: privatePaths.length ? '优先保留 Skill 的私有调用路径，按需取消 Agent 直接加载或全局加载；如需保留，在 System Prompt 中说明调用边界与优先级。' : '可移除 Agent 的重复直接加载配置；如需保留，请明确其用途。',
      });
    }
    if (tool.kind === 'mcp') coverage.push(`MCP「${tool.name}」的 ${tool.methods.length} 个方法未声明输入、输出 Schema，已检查方法名称、描述与加载路径。`);
    const paths = usage.paths.map((path) => `Agent → ${path.label} → ${tool.name}`);
    if (tool.kind === 'code') {
      candidates.push({ id: `tool:${tool.id}`, ownerId: tool.id, label: `Tool「${tool.name}」`, description: `${tool.name} ${tool.description}`, inputs: tool.inputs, outputs: tool.outputs, paths });
    } else {
      for (const method of tool.methods) candidates.push({ id: `tool:${tool.id}:${method.name}`, ownerId: tool.id, label: `${tool.name} / ${method.name}`, description: `${method.name} ${method.description}`, paths: paths.map((path) => `${path} / ${method.name}`) });
    }
  }
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]!, b = candidates[j]!;
      // The exact dependency overlap is already reported with all its paths.
      const ownDependency = (skill: Candidate, tool: Candidate) => skill.skillId && !tool.skillId && activeSkills.find((item) => item.id === skill.skillId)?.privateToolIds.includes(tool.ownerId);
      if (ownDependency(a, b) || ownDependency(b, a)) continue;
      const intents = intentRules.filter((rule) => rule.pattern.test(a.description) && rule.pattern.test(b.description)).map((rule) => rule.name);
      const similarity = textSimilarity(a.description, b.description);
      const inputs = commonParameters(a.inputs, b.inputs);
      const outputs = commonParameters(a.outputs, b.outputs);
      const sameInputShape = !!(a.inputs?.length && b.inputs?.length) && inputs.length === a.inputs!.length && inputs.length === b.inputs!.length;
      const sameOutputShape = !!(a.outputs?.length && b.outputs?.length) && outputs.length === a.outputs!.length && outputs.length === b.outputs!.length;
      const schemaAmbiguity = sameInputShape && sameOutputShape && inputs.length + outputs.length >= 3;
      if (!intents.length && similarity < 0.6 && !schemaAmbiguity) continue;
      findings.push({
        id: `overlap-${a.id}-${b.id}`, kind: intents.length || similarity >= 0.6 ? 'intent' : 'schema', severity: 'review',
        title: `${a.label}与${b.label}可能存在调用歧义`, paths: [...a.paths, ...b.paths],
        evidence: [
          ...(intents.length ? [`共同意图：${intents.join('、')}。`] : []),
          ...(!intents.length && similarity >= 0.6 ? [`功能描述的短语重合度约 ${Math.round(similarity * 100)}%，建议人工确认职责边界。`] : []),
          `能力 A：${a.description}`, `能力 B：${b.description}`,
          ...(inputs.length ? [`共有输入参数：${inputs.join('；')}。`] : []),
          ...(outputs.length ? [`共有输出参数：${outputs.join('；')}。`] : []),
          ...(schemaAmbiguity ? ['输入、输出的参数名与类型完全相同；相同 Schema 本身不能证明业务功能冲突。'] : []),
          ...(!a.inputs || !b.inputs ? ['至少一项能力缺少 Schema，本项基于描述判断。'] : []),
        ],
        suggestion: '明确两项能力分别适用的用户意图、前置条件和输出差异，并在 System Prompt 中指定路由优先级；必要时调整所加载的能力。',
      });
    }
  }
  if (!candidates.length) coverage.push('当前没有有效的 Skill 或可直接调用的 Tool，尚无可比较的调用入口。');
  return {
    fingerprint: agentConfigurationFingerprint(agent, catalog), checkedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    findings: findings.sort((a, b) => Number(b.severity === 'high') - Number(a.severity === 'high')),
    coverage, skillCount: activeSkills.length, toolCount: usages.filter((usage) => usage.tool).length,
    candidateCount: candidates.length, schemaCount: usages.filter((usage) => usage.tool?.kind === 'code').length,
  };
}
