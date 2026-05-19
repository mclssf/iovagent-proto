import type { Order, PageId } from '@/views/AgentWork/interface';

import { useRouter } from 'vue-router';

import { ElMessage } from 'element-plus';

import { agentWorkData } from '@/pinia/agentWork';

/** 与 `router/index` 中子路由 `name` 一致 */
export const agentWorkRouteName: Record<PageId, string> = {
  agent: 'agent-work-agent',
  orders: 'agent-work-orders',
  risk: 'agent-work-risk',
  detail: 'agent-work-detail',
  analytics: 'agent-work-analytics',
  projects: 'agent-work-projects',
  downloads: 'agent-work-downloads',
};

export function useAgentWorkNav() {
  const router = useRouter();
  const store = agentWorkData();

  function goPage(page: PageId) {
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
