import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ configFile: false, root, resolve: { alias: { '@': `${root}src` } }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const originalFetch = globalThis.fetch;

try {
  const { agentWorkData } = await server.ssrLoadModule('/src/pinia/agentWork.ts');
  setActivePinia(createPinia());
  const store = agentWorkData();
  store.startNewConversation();
  assert.equal(store.recentConversations.length, 0, 'entering a blank conversation creates no history');
  store.recentConversations = [
    { id: 'C-delete', title: '待删除对话', updatedAt: '刚刚', messages: [{ role: 'user', text: '待删除消息' }] },
    { id: 'C-keep', title: '保留对话', updatedAt: '刚刚', messages: [{ role: 'user', text: '保留消息' }] },
  ];
  store.openConversation('C-delete');

  const timers = [];
  globalThis.setTimeout = (callback) => {
    const timer = { callback, cancelled: false };
    timers.push(timer);
    return timer;
  };
  globalThis.clearTimeout = (timer) => { timer.cancelled = true; };
  let completed = false;
  store.startDelayedAgentProcess(store.agentMessages, {
    role: 'agent', title: '待执行流程', steps: [{ title: '查询', text: '查询车辆' }, { title: '回复', text: '返回结果' }], result: '旧结果',
  }, () => { completed = true; store.openExternalH5('/demo/old-result', '旧结果'); });
  store.agentInput = '未发送的草稿';
  store.openExternalH5('/demo/current', '当前结果');

  const before = JSON.stringify([store.agentMessages, store.agentInput, store.rightPanel, store.currentProjectId]);
  assert.equal(store.deleteConversation('missing'), false);
  assert.equal(JSON.stringify([store.agentMessages, store.agentInput, store.rightPanel, store.currentProjectId]), before);
  assert.equal(store.deleteConversation('C-keep'), true);
  assert.equal(store.currentConversationId, 'C-delete');
  assert.equal(JSON.stringify([store.agentMessages, store.agentInput, store.rightPanel, store.currentProjectId]), before, 'deleting another conversation preserves current messages, draft and panel');
  assert(timers.every((timer) => !timer.cancelled), 'deleting another conversation leaves the active process running');

  assert.equal(store.deleteConversation('C-delete'), true);
  assert.equal(store.workspaceMode, 'conversation');
  assert.equal(store.currentConversationId, '');
  assert.equal(store.currentConversation, null);
  assert.deepEqual(store.agentMessages, []);
  assert.equal(store.agentInput, '');
  assert.equal(store.rightPanel, 'overview');
  assert(timers.every((timer) => timer.cancelled), 'deleting the active conversation cancels every delayed step');
  timers.filter((timer) => !timer.cancelled).forEach((timer) => timer.callback());
  assert.equal(completed, false);
  store.persistActiveConversationMessages();
  assert.deepEqual(store.recentConversations, [], 'message persistence cannot recreate a deleted conversation');

  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
  store.recentConversations = [{ id: 'C-project-delete', title: '其他对话', updatedAt: '刚刚', messages: [] }];
  store.$patch({ workspaceMode: 'project', currentProjectId: store.projects[0].id, agentMessages: [{ role: 'agent', text: '项目消息' }], agentInput: '项目草稿' });
  const projectBefore = JSON.stringify([store.workspaceMode, store.currentProjectId, store.agentMessages, store.agentInput, store.rightPanel]);
  assert.equal(store.deleteConversation('C-project-delete'), true);
  assert.equal(JSON.stringify([store.workspaceMode, store.currentProjectId, store.agentMessages, store.agentInput, store.rightPanel]), projectBefore, 'deleting history from a project preserves project context');

  for (const responseKind of ['success', 'failure']) {
    let finishToolCall;
    let failToolCall;
    let notifyToolCall;
    const toolCalled = new Promise((resolve) => { notifyToolCall = resolve; });
    globalThis.fetch = async (_url, options) => {
      const { method } = JSON.parse(options.body);
      if (method === 'tools/call') {
        return new Promise((resolve, reject) => {
          finishToolCall = resolve;
          failToolCall = reject;
          notifyToolCall();
        });
      }
      const result = method === 'tools/list' ? { tools: [{ name: 'conversation-test', inputSchema: { properties: { prompt: {} } } }] } : {};
      return new Response(JSON.stringify({ result }), { headers: { 'Content-Type': 'application/json' } });
    };
    store.recentConversations = [{ id: 'C-mcp-delete', title: '待删除的异步对话', updatedAt: '刚刚', messages: [{ role: 'user', text: '旧请求' }] }];
    store.openConversation('C-mcp-delete');
    const pending = store.startMcpPromptTest([...store.agentMessages], '旧请求');
    await toolCalled;
    store.deleteConversation('C-mcp-delete');
    store.agentMessages = [{ role: 'user', text: '新请求' }, { role: 'agent', text: '新对话消息' }];
    const newMessages = JSON.stringify(store.agentMessages);
    if (responseKind === 'success') finishToolCall(new Response(JSON.stringify({ result: { content: [{ type: 'text', text: '迟到的旧结果' }] } })));
    else failToolCall(new Error('迟到的旧错误'));
    await pending;
    assert.equal(JSON.stringify(store.agentMessages), newMessages, `late MCP ${responseKind} cannot overwrite the new conversation at the same message index`);
  }
  console.log('Passed: inactive deletion preserves context; active deletion resets to a blank conversation and cancels delayed steps; deleted history stays removed; late MCP success/failure cannot overwrite new messages.');
} finally {
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
  globalThis.fetch = originalFetch;
  await server.close();
}
