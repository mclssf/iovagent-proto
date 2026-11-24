import type { Order, PageId } from '@/views/AgentWork/interface';

import { useRoute, useRouter } from 'vue-router';

import { ElMessage } from 'element-plus';

import { agentWorkData } from '@/pinia/agentWork';

/** 与 `router/index` 中子路由 `name` 一致 */
export const agentWorkRouteName: Record<PageId, string> = {
  agent: 'agent-work-agent',
  longTasks: 'agent-work-long-tasks',
  orders: 'agent-work-orders',
  risk: 'agent-work-risk',
  detail: 'agent-work-detail',
  analytics: 'agent-work-analytics',
  projects: 'agent-work-projects',
  projectCreate: 'agent-work-project-create',
  downloads: 'agent-work-downloads',
  knowledgeBase: 'agent-work-knowledge-base',
  knowledgeBaseEmpty: 'agent-work-knowledge-base-empty',
};

export function useAgentWorkNav() {
  const route = useRoute();
  const router = useRouter();
  const store = agentWorkData();

  function goPage(page: PageId, query: Record<string, string> = {}) {
    if (page === 'projectCreate') {
      if (route.name === agentWorkRouteName.projectCreate) return Promise.resolve();
      return router.push({ name: agentWorkRouteName[page], query: { from: route.fullPath, ...query } });
    }
    return router.push({ name: agentWorkRouteName[page] });
  }

  function openOrderDetail(order: Order) {
    store.setSelectedOrder(order);
    return goPage('detail');
  }

  function createDownload(scope: string) {
    store.startDownloadTask(scope);
    ElMessage.success('已创建下载任务');
    return goPage('downloads');
  }

  function sendAgent(text?: string) {
    store.appendAgentExchange(text, goPage);
  }

  return { goPage, openOrderDetail, createDownload, sendAgent };
}
