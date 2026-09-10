<script lang="ts" setup>
import type { PageId, Project } from '../interface';

import { computed, nextTick, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Icon } from '@packages/icon';
import { storeToRefs } from 'pinia';

import { agentWorkData } from '@/pinia/agentWork';
import { removeToken } from '@/utils/auth';

import { strokeIconPaths } from '../strokeIconPaths';
import { agentWorkRouteName } from '../useAgentWorkNav';
import { badgeToneClass, projectStatusTone } from '../utils';

const store = agentWorkData();
const { projects, recentConversations } = storeToRefs(store);
const route = useRoute();
const router = useRouter();
const isUserMenuOpen = ref(false);
const expandedProjectId = ref(store.currentProjectId);
const editingConversationId = ref('');
const editingConversationTitle = ref('');
const conversationTitleInputRef = ref<HTMLInputElement | HTMLInputElement[] | null>(null);

const currentUserName = computed(
  () => localStorage.getItem('iovagent_login_user') || import.meta.env.VITE_APP_DEFAULT_LOGIN_USERNAME || '演示用户',
);

const publicNavs: { icon: string; id: PageId; label: string }[] = [
  { id: 'longTasks', label: '长期任务', icon: strokeIconPaths.alarmClock },
  { id: 'downloads', label: '下载', icon: strokeIconPaths.download },
];

const projectNavs: { icon: string; id: PageId; label: string }[] = [
  { id: 'agent', label: '智能体工作台', icon: strokeIconPaths.bot },
  { id: 'orders', label: '运单列表', icon: strokeIconPaths.list },
  { id: 'risk', label: '异常运单列表', icon: strokeIconPaths.shield },
  { id: 'detail', label: '运单详情与地图', icon: strokeIconPaths.map },
];

const capacityProjectNavs: Array<{ icon: string; id: PageId; label: string; skillIds: string[] }> = [
  {
    id: 'cargoSources',
    label: '我发布的货源',
    icon: strokeIconPaths.packageSearch,
    skillIds: ['huadong-cargo-connector', 'capacity-cargo-normalization', 'capacity-cargo-publish'],
  },
  {
    id: 'cargoQuotes',
    label: '报价抢单',
    icon: strokeIconPaths.receipt,
    skillIds: ['capacity-quote-collection'],
  },
  {
    id: 'privateCapacity',
    label: '私有运力池',
    icon: strokeIconPaths.usersRound,
    skillIds: ['capacity-private-fleet'],
  },
];

function projectNavsFor(project: Project) {
  const enabledSkillIds = project.skillIds ?? [];
  return [
    ...projectNavs,
    ...capacityProjectNavs.filter((item) => item.skillIds.some((skillId) => enabledSkillIds.includes(skillId))),
  ];
}

function goNav(page: PageId) {
  if (page === 'projectCreate') {
    router.push({ name: agentWorkRouteName[page], query: { from: route.fullPath } });
    return;
  }
  router.push({ name: agentWorkRouteName[page] });
}

function isNavActive(page: PageId) {
  if (page === 'projects' && route.name === agentWorkRouteName.projectCreate) return true;
  return route.name === agentWorkRouteName[page];
}

function startNewConversation() {
  store.startNewConversation();
  expandedProjectId.value = '';
  goNav('agent');
}

function openConversation(conversationId: string) {
  store.openConversation(conversationId);
  expandedProjectId.value = '';
  goNav('agent');
}

function toggleProject(project: Project) {
  if (expandedProjectId.value === project.id) {
    expandedProjectId.value = '';
    return;
  }
  expandedProjectId.value = project.id;
  store.switchProject(project);
  goNav('agent');
}

function openProjectPage(page: PageId) {
  goNav(page);
}

function startConversationTitleEdit(conversationId: string, title: string) {
  editingConversationId.value = conversationId;
  editingConversationTitle.value = title;
  nextTick(() => {
    const inputRef = Array.isArray(conversationTitleInputRef.value)
      ? conversationTitleInputRef.value[0]
      : conversationTitleInputRef.value;
    inputRef?.focus();
    inputRef?.select();
  });
}

function commitConversationTitleEdit() {
  if (!editingConversationId.value) return;
  store.renameConversation(editingConversationId.value, editingConversationTitle.value);
  editingConversationId.value = '';
  editingConversationTitle.value = '';
}

function cancelConversationTitleEdit() {
  editingConversationId.value = '';
  editingConversationTitle.value = '';
}

function logout() {
  removeToken();
  localStorage.removeItem('token');
  localStorage.removeItem('iovagent_login_user');
  isUserMenuOpen.value = false;
  router.replace('/login');
}
</script>

<template>
  <aside class="flex h-full min-h-0 flex-col overflow-hidden border-r border-[#e7e7e4] bg-[#f5f5f3]">
    <div class="shrink-0 px-4 pt-4 pb-3">
      <div class="flex h-9 items-center gap-2.5">
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#deded9] bg-white text-slate-700">
          <Icon :svg="strokeIconPaths.truck" :size="18" />
        </span>
        <span class="truncate text-sm font-semibold text-slate-950">物流通用智能体</span>
      </div>
    </div>

    <div class="shrink-0 px-3 pb-3">
      <button
        type="button"
        class="flex h-9 w-full items-center gap-2.5 rounded-md px-3 text-sm font-medium transition"
        :class="
          store.workspaceMode === 'conversation' && !store.currentConversationId && isNavActive('agent')
            ? 'bg-white text-slate-950 shadow-[0_1px_2px_rgba(15,23,42,0.05)]'
            : 'text-slate-700 hover:bg-white/80 hover:text-slate-950'
        "
        @click="startNewConversation"
      >
        <Icon :svg="strokeIconPaths.plus" :size="17" />
        新对话
      </button>
    </div>

    <div class="sidebar-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4">
      <nav class="space-y-1 border-b border-[#e3e3df] pb-4">
        <button
          v-for="item in publicNavs"
          :key="item.id"
          type="button"
          class="flex h-9 w-full items-center gap-2.5 rounded-md px-3 text-sm transition"
          :class="isNavActive(item.id) ? 'bg-white font-medium text-slate-950' : 'text-slate-600 hover:bg-white/75 hover:text-slate-900'"
          @click="goNav(item.id)"
        >
          <Icon :svg="item.icon" :size="16" />
          {{ item.label }}
        </button>
      </nav>

      <section class="pt-4">
        <div class="mb-1 flex h-7 items-center px-2">
          <h2 class="text-xs font-medium text-slate-500">最近对话</h2>
        </div>
        <div class="space-y-0.5">
          <div
            v-for="conversation in recentConversations"
            :key="conversation.id"
            class="group flex min-h-9 items-center rounded-md transition"
            :class="
              store.workspaceMode === 'conversation' && store.currentConversationId === conversation.id && isNavActive('agent')
                ? 'bg-white'
                : 'hover:bg-white/75'
            "
          >
            <template v-if="editingConversationId === conversation.id">
              <input
                ref="conversationTitleInputRef"
                v-model="editingConversationTitle"
                type="text"
                maxlength="40"
                class="mx-1 h-8 min-w-0 flex-1 rounded-md border border-blue-400 bg-white px-2 text-xs text-slate-900 outline-none ring-2 ring-blue-100"
                aria-label="编辑对话标题"
                @blur="commitConversationTitleEdit"
                @keydown.enter.prevent="commitConversationTitleEdit"
                @keydown.esc.prevent="cancelConversationTitleEdit"
              />
            </template>
            <template v-else>
              <button
                type="button"
                class="flex h-9 min-w-0 flex-1 items-center gap-2 px-2.5 text-left text-xs text-slate-700"
                @click="openConversation(conversation.id)"
              >
                <Icon :svg="strokeIconPaths.msg" :size="14" svg-class="shrink-0 text-slate-400" />
                <span class="min-w-0 flex-1 truncate">{{ conversation.title }}</span>
              </button>
              <button
                type="button"
                class="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 opacity-0 transition hover:bg-[#eeeeeb] hover:text-slate-800 focus:opacity-100 group-hover:opacity-100"
                :aria-label="`修改对话标题：${conversation.title}`"
                title="修改标题"
                @click="startConversationTitleEdit(conversation.id, conversation.title)"
              >
                <Icon :svg="strokeIconPaths.edit" :size="13" />
              </button>
            </template>
          </div>
        </div>
      </section>

      <section class="pt-5">
        <div class="mb-1 flex h-8 items-center justify-between gap-2 px-2">
          <h2 class="text-xs font-medium text-slate-500">项目</h2>
          <div class="flex items-center gap-0.5">
            <button
              type="button"
              class="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-slate-500 transition hover:bg-white hover:text-slate-900"
              :class="isNavActive('projectCreate') ? 'bg-white font-medium text-slate-950' : ''"
              @click="goNav('projectCreate')"
            >
              <Icon :svg="strokeIconPaths.plus" :size="13" />
              新建
            </button>
            <button
              type="button"
              class="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-slate-500 transition hover:bg-white hover:text-slate-900"
              :class="isNavActive('projects') ? 'bg-white font-medium text-slate-950' : ''"
              @click="goNav('projects')"
            >
              <Icon :svg="strokeIconPaths.settings" :size="13" />
              管理
            </button>
          </div>
        </div>

        <div class="space-y-1">
          <div v-for="project in projects" :key="project.id">
            <button
              type="button"
              class="w-full rounded-md px-2.5 py-2 text-left transition hover:bg-white/75"
              :class="expandedProjectId === project.id ? 'bg-white' : ''"
              :aria-expanded="expandedProjectId === project.id"
              @click="toggleProject(project)"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="min-w-0 truncate text-xs font-medium text-slate-800">{{ project.name }}</span>
                <Icon
                  :svg="strokeIconPaths.chevron"
                  :size="13"
                  :svg-class="expandedProjectId === project.id ? 'shrink-0 rotate-90 text-slate-500' : 'shrink-0 text-slate-400'"
                />
              </div>
              <div class="mt-1 flex items-center justify-between gap-2">
                <span class="truncate text-[11px] leading-4 text-slate-400">今日 {{ project.total }} 单 · {{ project.risk }} 异常</span>
                <span
                  class="shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium leading-3.5"
                  :class="badgeToneClass(projectStatusTone(project.status))"
                >
                  {{ project.status }}
                </span>
              </div>
            </button>

            <div v-if="expandedProjectId === project.id" class="relative ml-3 mt-1 space-y-0.5 pl-3 before:absolute before:top-1 before:bottom-1 before:left-0 before:w-px before:bg-[#d9d9d4]">
              <button
                v-for="item in projectNavsFor(project)"
                :key="item.id"
                type="button"
                class="flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs transition"
                :class="
                  store.workspaceMode === 'project' && store.currentProjectId === project.id && isNavActive(item.id)
                    ? 'bg-white font-medium text-slate-950'
                    : 'text-slate-500 hover:bg-white/75 hover:text-slate-900'
                "
                @click="openProjectPage(item.id)"
              >
                <Icon :svg="item.icon" :size="14" />
                {{ item.label }}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <div class="relative shrink-0 border-t border-[#e3e3df] bg-[#f5f5f3] p-3">
      <div
        v-if="isUserMenuOpen"
        class="absolute right-3 bottom-full left-3 z-20 mb-2 overflow-hidden rounded-md border border-[#deded9] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.12)]"
      >
        <button type="button" class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-[#f7f7f5]" @click="logout">
          <Icon :svg="strokeIconPaths.x" :size="15" />
          退出登录
        </button>
      </div>
      <button
        type="button"
        class="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm text-slate-700 transition hover:bg-white"
        @click="isUserMenuOpen = !isUserMenuOpen"
      >
        <span class="flex min-w-0 items-center gap-2">
          <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#deded9] bg-white text-slate-600">
            <Icon :svg="strokeIconPaths.user" :size="15" />
          </span>
          <span class="min-w-0">
            <span class="block text-[11px] leading-4 text-slate-400">当前用户</span>
            <span class="block truncate text-xs font-medium leading-4 text-slate-800">{{ currentUserName }}</span>
          </span>
        </span>
        <Icon :svg="strokeIconPaths.chevron" :size="14" :svg-class="isUserMenuOpen ? '-rotate-90 text-slate-500' : 'rotate-90 text-slate-400'" />
      </button>
    </div>
  </aside>
</template>

<style lang="scss">
.sidebar-scroll {
  scrollbar-color: #d4d4cf transparent;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
}

.sidebar-scroll::-webkit-scrollbar {
  width: 6px;
}

.sidebar-scroll::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: #d4d4cf;
}
</style>
