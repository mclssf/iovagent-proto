import type { Router } from 'vue-router';

import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router';

export let router!: Router;

export function handleRouter(_routerList: any) {
  router = createRouter({
    history: import.meta.env.VITE_ROUTER_HISTORY === 'hash' ? createWebHashHistory(import.meta.env.VITE_BASE) : createWebHistory(import.meta.env.VITE_BASE),
    routes: [
      {
        path: '/',
        name: 'main',
        redirect: '/login',
      },
      {
        path: '/login',
        name: 'login',
        component: () => import('@/views/LoginAgent.vue'),
      },
      {
        path: '/agent-ops',
        name: 'agent-ops',
        component: () => import('@/views/AgentOpsConfig.vue'),
      },
      {
        path: '/index',
        component: () => import('@/views/AgentWork/index.view.vue'),
        redirect: { name: 'agent-work-agent' },
        children: [
          {
            path: 'agent',
            name: 'agent-work-agent',
            component: () => import('@/views/AgentWork/views/agent.view.vue'),
          },
          {
            path: 'tasks',
            name: 'agent-work-long-tasks',
            component: () => import('@/views/AgentWork/views/longTasks.view.vue'),
          },
          {
            path: 'orders',
            name: 'agent-work-orders',
            component: () => import('@/views/AgentWork/views/orderList.view.vue'),
            props: { listMode: 'orders' as const },
          },
          {
            path: 'risk',
            name: 'agent-work-risk',
            component: () => import('@/views/AgentWork/views/orderList.view.vue'),
            props: { listMode: 'risk' as const },
          },
          {
            path: 'detail',
            name: 'agent-work-detail',
            component: () => import('@/views/AgentWork/views/orderDetail.view.vue'),
          },
          {
            path: 'analytics',
            name: 'agent-work-analytics',
            component: () => import('@/views/AgentWork/views/analytics.view.vue'),
          },
          {
            path: 'projects',
            name: 'agent-work-projects',
            component: () => import('@/views/AgentWork/views/projects.view.vue'),
          },
          {
            path: 'projects/new',
            name: 'agent-work-project-create',
            component: () => import('@/views/AgentWork/views/projectCreate.view.vue'),
          },
          {
            path: 'downloads',
            name: 'agent-work-downloads',
            component: () => import('@/views/AgentWork/views/downloads.view.vue'),
          },
          {
            path: 'knowledge-base',
            name: 'agent-work-knowledge-base',
            component: () => import('@/views/AgentWork/views/knowledgeBase.view.vue'),
          },
          {
            path: 'knowledge-base-empty',
            name: 'agent-work-knowledge-base-empty',
            component: () => import('@/views/AgentWork/views/knowledgeBase.view.vue'),
            props: { emptyMode: true },
          },
        ],
      },
    ],
    scrollBehavior: (to, _from, savedPosition) => {
      if (savedPosition) {
        return savedPosition;
      }
      return to.hash ? { behavior: 'smooth', el: to.hash } : { left: 0, top: 0 };
    },
  });

  return router;
}
