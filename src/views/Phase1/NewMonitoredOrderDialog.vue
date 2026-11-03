<script setup lang="ts">
import { reactive, ref } from 'vue';
import { ElDatePicker, ElForm, ElFormItem, ElInput, ElInputNumber, ElOption, ElSelect } from 'element-plus';
import AppDialog from '@/components/AppDialog.vue';
import { usePhase1 } from '@/pinia/phase1';
import { loadAMap } from '@/utils/amap';
const props = defineProps<{ projectId: string }>();
const emit = defineEmits<{ close: []; created: [id: string] }>();
const store = usePhase1();
const place = () => ({ name: '', lat: undefined as number | undefined, lon: undefined as number | undefined, regionCode: '', radiusMeters: 500, coordinateSystem: 'gcj02' as const });
const form = reactive({ id: `WB${Date.now()}`, plate: '', plateColor: 2, driver: '', origin: place(), destination: place(), departure: null as Date | null, arrival: null as Date | null });
const loading = ref('');
type Geocode = { location: { getLat(): number; getLng(): number }; adcode: string };
type GeocoderAPI = { Geocoder: new (options: { city: string }) => { getLocation(address: string, callback: (status: string, data: { geocodes?: Geocode[] }) => void): void } };
const error = ref('');
let generation = 0;
function invalidate(type: 'origin' | 'destination') { form[type].lat = undefined; form[type].lon = undefined; form[type].regionCode = ''; generation++; }
async function locate(type: 'origin' | 'destination') {
  if (!form[type].name.trim()) { error.value = '请先填写详细地点'; return; }
  const current = ++generation, address = form[type].name;
  loading.value = type; error.value = '';
  try {
    const amap = await loadAMap(['AMap.Geocoder']);
    const result = await new Promise<Geocode>((resolve, reject) => {
      const geocoder = new (amap as unknown as GeocoderAPI).Geocoder({ city: '全国' });
      geocoder.getLocation(address, (status, data) => { if (status === 'complete' && data.geocodes?.[0]) resolve(data.geocodes[0]); else reject(new Error('未找到明确地点，请补充省市和详细地址')); });
    });
    if (current !== generation || form[type].name !== address) return;
    Object.assign(form[type], { lat: result.location.getLat(), lon: result.location.getLng(), regionCode: result.adcode });
  } catch (failure) { if (current === generation) error.value = (failure as Error).message || '地址解析失败，请填写经纬度'; }
  finally { loading.value = ''; }
}
function save() {
  if ([form.origin.lat, form.origin.lon, form.destination.lat, form.destination.lon].some(value => typeof value !== 'number' || !Number.isFinite(value))) { error.value = '请确认两个地点的位置，或填写有效经纬度'; return; }
  const ok = store.createOrder({ id: form.id.trim(), projectId: props.projectId, plate: form.plate.trim().toUpperCase(), plateColor: form.plateColor as 1 | 2, driver: form.driver.trim() || '未提供', source: '手动录入', origin: { ...form.origin, lat: form.origin.lat, lon: form.origin.lon }, destination: { ...form.destination, lat: form.destination.lat, lon: form.destination.lon }, plannedDeparture: form.departure?.getTime() ?? null, plannedArrival: form.arrival?.getTime() ?? null });
  if (!ok) { error.value = store.error; return; }
  emit('created', form.id.trim()); emit('close');
}
</script>
<template>
  <AppDialog :model-value="true" title="新增运单" width="640px" @update:model-value="generation++; emit('close')">
    <ElForm label-position="top" class="new-monitor-order" @submit.prevent="save">
      <div class="monitor-order-grid"><ElFormItem label="运单号" required><ElInput v-model="form.id" aria-label="运单号" /></ElFormItem><ElFormItem label="车牌号" required><ElInput v-model="form.plate" aria-label="车牌号" placeholder="请输入车牌号" /></ElFormItem><ElFormItem label="车牌颜色"><ElSelect v-model="form.plateColor"><ElOption :value="1" label="蓝色" /><ElOption :value="2" label="黄色" /></ElSelect></ElFormItem><ElFormItem label="司机"><ElInput v-model="form.driver" placeholder="司机姓名" /></ElFormItem></div>
      <section v-for="(label, type) in { origin: '装货地点', destination: '卸货地点' }" :key="type" class="monitor-location"><ElFormItem :label="label" required><div class="monitor-address"><ElInput v-model="form[type].name" placeholder="省市区及详细地址" @input="invalidate(type)" /><button class="dialog-button" :disabled="!!loading" @click="locate(type)">{{ loading === type ? '查询中…' : '定位地址' }}</button></div></ElFormItem><p v-if="form[type].lat && form[type].lon" class="dialog-note">{{ form[type].lon.toFixed(6) }}, {{ form[type].lat.toFixed(6) }}</p><details><summary>经纬度与围栏</summary><div class="monitor-order-grid"><ElFormItem label="经度"><ElInputNumber v-model="form[type].lon" :min="-180" :max="180" :precision="6" :controls="false" /></ElFormItem><ElFormItem label="纬度"><ElInputNumber v-model="form[type].lat" :min="-90" :max="90" :precision="6" :controls="false" /></ElFormItem><ElFormItem label="行政区代码"><ElInput v-model="form[type].regionCode" maxlength="6" placeholder="六位行政区代码" /></ElFormItem><ElFormItem label="围栏半径（米）"><ElInputNumber v-model="form[type].radiusMeters" :min="1" :max="10000" controls-position="right" /></ElFormItem></div></details></section>
      <div class="monitor-order-grid"><ElFormItem label="预计出发"><ElDatePicker v-model="form.departure" type="datetime" placeholder="选择出发时间" /></ElFormItem><ElFormItem label="预计到达"><ElDatePicker v-model="form.arrival" type="datetime" placeholder="选择到达时间" /></ElFormItem></div>
      <p v-if="error" class="text-xs text-red-700" role="alert">{{ error }}</p>
    </ElForm>
    <template #footer><div class="dialog-footer"><span class="dialog-note">依据计划时间初始化状态，实际节点以运输记录为准</span><div class="dialog-actions"><button class="dialog-button" @click="generation++; emit('close')">取消</button><button class="dialog-button dialog-primary" :disabled="!!loading" @click="save">创建</button></div></div></template>
  </AppDialog>
</template>
<style scoped>
.monitor-order-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 16px}.monitor-order-grid :deep(.el-date-editor),.monitor-order-grid :deep(.el-input-number){width:100%}.monitor-location{margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #e5e7eb}.monitor-address{display:flex;width:100%;gap:8px}.monitor-address>.dialog-button{flex-shrink:0}.monitor-location details{font-size:12px;margin-top:8px}.monitor-location summary{cursor:pointer;color:#1d4ed8;margin-bottom:12px}.new-monitor-order :deep(.el-form-item__label){font-size:13px}@media(max-width:560px){.monitor-order-grid{grid-template-columns:1fr}}
</style>
