<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { ElDialog, ElMessage, ElMessageBox } from 'element-plus';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Icon } from '@packages/icon';
import { agentWorkData } from '@/pinia/agentWork';
import { useAgentDailyTasks } from '@/pinia/agentDailyTasks';
import { strokeIconPaths } from '../strokeIconPaths';
import '../dailyTasks.css';

const props = defineProps<{ modelValue: boolean; projectId: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; saved: [id: string] }>();
const work = agentWorkData();
const tasks = useAgentDailyTasks();
const runtime = computed(() => tasks.projects[props.projectId]);
const form = reactive({ name: '', latitude: 31.2857, longitude: 121.1668, radius: 1500 });
const error = ref('');
const mapFailed = ref(false);
const mapRef = ref<HTMLDivElement | null>(null);
let map: L.Map | undefined;
let circle: L.Circle | undefined;

function updateCircle() {
  if (!map || !Number.isFinite(form.latitude) || !Number.isFinite(form.longitude) || Math.abs(form.latitude) > 90 || Math.abs(form.longitude) > 180 || form.radius < 100 || form.radius > 50000) return;
  circle?.setLatLng([form.latitude, form.longitude]).setRadius(form.radius);
}

async function openMap() {
  error.value = '';
  mapFailed.value = false;
  await nextTick();
  if (!mapRef.value || map) return;
  map = L.map(mapRef.value).setView([form.latitude, form.longitude], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 19 })
    .on('tileerror', () => { mapFailed.value = true; }).addTo(map);
  circle = L.circle([form.latitude, form.longitude], { radius: form.radius, color: '#2563eb', fillOpacity: 0.12, weight: 2 }).addTo(map);
  map.on('click', (event: L.LeafletMouseEvent) => {
    form.latitude = Number(event.latlng.lat.toFixed(6));
    form.longitude = Number(event.latlng.lng.toFixed(6));
  });
  map.invalidateSize();
}

function closeMap() { map?.remove(); map = undefined; circle = undefined; }
watch(() => [form.latitude, form.longitude, form.radius], updateCircle);
watch(() => props.projectId, () => { emit('update:modelValue', false); closeMap(); });
onBeforeUnmount(closeMap);

function save() {
  try {
    const fence = tasks.saveFence(props.projectId, form);
    const project = work.projects.find((item) => item.id === props.projectId);
    if (project) project.skillIds = [...new Set([...(project.skillIds ?? []), 'custom-fence-expert'])];
    tasks.syncProjects(work.projects, work.ordersSeed);
    emit('saved', fence.id);
    form.name = '';
    error.value = '';
    ElMessage.success('围栏已保存，已订阅进出事件');
  } catch (failure) { error.value = (failure as Error).message; }
}

async function remove(id: string) {
  try {
    await ElMessageBox.confirm('删除围栏后，订阅该围栏的日常任务将等待重新配置。', '删除围栏', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' });
    tasks.deleteFence(props.projectId, id);
  } catch { /* Dialog cancellation leaves the fence unchanged. */ }
}

function callback(id: string, type: 'fence-enter' | 'fence-exit') {
  const project = work.projects.find((item) => item.id === props.projectId);
  if (!project?.skillIds?.includes('custom-fence-expert')) { ElMessage.warning('请先启用自定义围栏判断技能'); return; }
  if (!runtime.value?.connected || !runtime.value.orders.length) { ElMessage.warning('请先连接数据源并接入运单'); return; }
  tasks.simulateFenceCallback(props.projectId, id, type);
  ElMessage.success('围栏事件已产生，匹配的日常任务已触发');
}
</script>

<template>
  <ElDialog :model-value="modelValue" title="项目区域围栏" width="min(720px, calc(100vw - 32px))" append-to-body destroy-on-close @update:model-value="emit('update:modelValue', $event)" @opened="openMap" @closed="closeMap">
    <div class="dt-surface">
      <div v-if="runtime?.fences.length" class="dt-fence-list">
        <div v-for="fence in runtime.fences" :key="fence.id" class="dt-fence-row">
          <div><strong>{{ fence.name }}</strong><small>半径 {{ fence.radius }} 米 · 已订阅进出事件</small></div>
          <div class="dt-actions">
            <button class="dt-button" type="button" @click="callback(fence.id, 'fence-enter')">模拟进入</button>
            <button class="dt-button" type="button" @click="callback(fence.id, 'fence-exit')">模拟离开</button>
            <button class="dt-icon" type="button" :aria-label="`删除围栏 ${fence.name}`" title="删除围栏" @click="remove(fence.id)"><Icon :svg="strokeIconPaths.trash" :size="15" /></button>
          </div>
        </div>
      </div>
      <form class="dt-form" @submit.prevent="save">
        <label>围栏名称<input v-model="form.name" maxlength="40" placeholder="例如：嘉定工厂装货区" required /></label>
        <div ref="mapRef" class="dt-fence-map" aria-label="围栏中心点地图" />
        <p v-if="mapFailed" class="dt-error" role="status">底图暂不可用，可通过下方经纬度设置围栏。</p>
        <div class="dt-form-grid three">
          <label>中心经度<input v-model.number="form.longitude" type="number" min="-180" max="180" step="0.000001" required /></label>
          <label>中心纬度<input v-model.number="form.latitude" type="number" min="-90" max="90" step="0.000001" required /></label>
          <label>半径（米）<input v-model.number="form.radius" type="number" min="100" max="50000" step="100" required /></label>
        </div>
        <p v-if="error" class="dt-error" role="alert">{{ error }}</p>
        <div class="dt-dialog-footer"><button class="dt-button" type="button" @click="emit('update:modelValue', false)">完成</button><button class="dt-button primary" type="submit"><Icon :svg="strokeIconPaths.plus" :size="14" />保存围栏</button></div>
      </form>
    </div>
  </ElDialog>
</template>
