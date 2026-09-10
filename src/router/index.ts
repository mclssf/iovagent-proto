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
            path: 'cargo-sources',
            name: 'agent-work-cargo-sources',
            component: () => import('@/views/AgentWork/views/cargoList.view.vue'),
          },
          {
            path: 'cargo-quotes',
            name: 'agent-work-cargo-quotes',
            component: () => import('@/views/AgentWork/views/cargoQuotes.view.vue'),
          },
          {
            path: 'private-capacity',
            name: 'agent-work-private-capacity',
            component: () => import('@/views/AgentWork/views/privateCapacity.view.vue'),
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
