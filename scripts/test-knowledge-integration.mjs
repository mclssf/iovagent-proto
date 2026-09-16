import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createPinia, setActivePinia } from 'pinia';
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ configFile: false, root, resolve: { alias: { '@': `${root}src` } }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
try {
  setActivePinia(createPinia());
  const { agentWorkData, hasKnowledgeBaseIntent } = await server.ssrLoadModule('/src/pinia/agentWork.ts');
  for (const text of ['按规则筛选在途预警', '皖K55821 异常停车怎么处理', '生成标准运单表']) assert.equal(hasKnowledgeBaseIntent(text), false, text);
  for (const text of ['查询知识库的停车处理流程', 'sop 的异常处理办法', '@合同与赔付标准 货损赔付']) assert.equal(hasKnowledgeBaseIntent(text), true, text);
  const store = agentWorkData();
  const messages = [{ role: 'user', text: '知识库中的异常停车流程' }, { role: 'agent', text: '示例回答', sources: [{ name: 'SOP.pdf', summary: '示例' }] }];
  store.startExampleConversation('知识库示例', messages);
  const id = store.currentConversationId;
  assert.equal(store.recentConversations.find(item => item.id === id).title, '知识库示例');
  messages[1].sources[0].name = 'changed';
  assert.equal(store.agentMessages[1].sources[0].name, 'SOP.pdf', 'sample messages detach from their fixtures');
  store.agentMessages.push({ role: 'user', text: '继续查询' });
  store.startNewConversation();
  store.openConversation(id);
  assert.equal(store.agentMessages.at(-1).text, '继续查询', 'sample conversation survives switching with follow-up messages');
  store.renameConversation(id, '我的查询');
  assert.equal(store.recentConversations.find(item => item.id === id).title, '我的查询');
  console.log('Passed: focused knowledge intents and persistent, editable example conversation history.');
} finally { await server.close(); }
