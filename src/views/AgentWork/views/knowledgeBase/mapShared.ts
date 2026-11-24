// 地图绘制共享工具：与 knowledgeBase.view.vue 现有飞线视觉语言保持一致
// （渐变弧线、中点方向箭头、运单量三档配色）
import L from 'leaflet';

export interface ArcLine {
  id: string;
  from: string;
  to: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  waybillCount: number;
  carrierVehicleCount: number;
}

export const LINE_TIER_STYLES: Record<'low' | 'mid' | 'high', { color: string; weight: number }> = {
  low: { color: '#3b82f6', weight: 1.5 },
  mid: { color: '#8b5cf6', weight: 2.5 },
  high: { color: '#dc2626', weight: 3.5 },
};

/** 动态等距分档：(max - min) / 3 为步长 */
export function getLineTierMap(lines: ArcLine[]): Record<string, { color: string; weight: number }> {
  const counts = lines.map((line) => line.waybillCount);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const step = (max - min) / 3;
  const styles: Record<string, { color: string; weight: number }> = {};
  lines.forEach((line) => {
    let tier: 'low' | 'mid' | 'high' = 'mid';
    if (max > min) {
      if (line.waybillCount >= min + 2 * step) tier = 'high';
      else if (line.waybillCount >= min + step) tier = 'mid';
      else tier = 'low';
    }
    styles[line.id] = { ...LINE_TIER_STYLES[tier] };
  });
  return styles;
}

/**
 * 线路浮窗
 * @param sensitive 传入则追加「途经敏感区域停靠」相关行
 */
export function buildLineTooltipHtml(
  line: ArcLine,
  sensitive?: { waybills: number; areaCount: number; vehicles: number },
) {
  const sensitiveRows = sensitive
    ? `<div class="line-tooltip-row"><span>敏感区域停靠运单</span><b style="color:#dc2626">${sensitive.waybills.toLocaleString()} 单</b></div>
    <div class="line-tooltip-row"><span>涉及敏感区域</span><b>${sensitive.areaCount} 个</b></div>
    <div class="line-tooltip-row"><span>涉及车辆</span><b>${sensitive.vehicles.toLocaleString()} 辆</b></div>`
    : '';
  return `<div class="line-tooltip-content">
    <div class="line-tooltip-title">${line.from} → ${line.to}</div>
    <div class="line-tooltip-row"><span>运单数</span><b>${line.waybillCount.toLocaleString()} 单</b></div>
    <div class="line-tooltip-row"><span>承运车辆数</span><b>${line.carrierVehicleCount.toLocaleString()} 辆</b></div>
    ${sensitiveRows}
  </div>`;
}

/** 精致箭头：实心三角，与线同色，白边加粗 */
export function createArrowIcon(color: string) {
  const svg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="12" viewBox="0 0 16 12"><path d="M1 6 L13 2 L11 6 L13 10 Z" fill="${color}" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  );
  return L.divIcon({
    className: 'leaflet-arrow-icon',
    html: `<img src="data:image/svg+xml,${svg}" style="width:16px;height:12px;display:block;" />`,
    iconSize: [16, 12],
    iconAnchor: [8, 6],
  });
}

/** 二次贝塞尔弧线（直飞一步） */
export function buildArcPoints(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  segments = 64,
): L.LatLngExpression[] {
  const midLat = (fromLat + toLat) / 2;
  const midLng = (fromLng + toLng) / 2;
  const dx = toLng - fromLng;
  const dy = toLat - fromLat;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const bulge = dist * 0.18;
  const ctrlLat = midLat + (-dy / dist) * bulge;
  const ctrlLng = midLng + (dx / dist) * bulge;
  const points: L.LatLngExpression[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const a = (1 - t) ** 2;
    const b = 2 * (1 - t) * t;
    const c = t * t;
    points.push([a * fromLat + b * ctrlLat + c * toLat, a * fromLng + b * ctrlLng + c * toLng]);
  }
  return points;
}

export function fitBoundsToLines(map: L.Map, lines: ArcLine[]) {
  if (lines.length === 0) return;
  if (lines.length === 1) {
    const only = lines[0]!;
    map.setView([(only.fromLat + only.toLat) / 2, (only.fromLng + only.toLng) / 2], 8);
    return;
  }
  const bounds = L.latLngBounds(
    lines.flatMap((line) => [
      [line.fromLat, line.fromLng] as [number, number],
      [line.toLat, line.toLng] as [number, number],
    ]),
  );
  map.fitBounds(bounds, { padding: [48, 48] });
}

export function initBaseMap(el: HTMLElement, center: [number, number], zoom: number): L.Map {
  const map = L.map(el, {
    attributionControl: false,
    center,
    zoom,
    zoomControl: false,
    zoomSnap: 0.5,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 90,
    fadeAnimation: true,
    zoomAnimation: true,
    markerZoomAnimation: true,
  });
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  applyBaseMapStyle(map, 'standard');
  return map;
}

/** 底图样式：标准路网图 / 卫星影像图 */
export type BaseMapStyle = 'standard' | 'satellite';

export const BASE_MAP_OPTIONS: Array<{ id: BaseMapStyle; label: string }> = [
  { id: 'standard', label: '标准图' },
  { id: 'satellite', label: '卫星图' },
];

/**
 * 底图瓦片配置（原型阶段使用高德栅格，GCJ-02 坐标系，与 WGS-84 业务数据存在偏移，仅作演示）
 * 卫星图 = 影像(style=6, JPEG) + 透明路网注记(style=8, RGBA PNG) 两层叠加
 */
const BASE_LAYERS: Record<BaseMapStyle, Array<{ url: string; filtered?: boolean }>> = {
  standard: [
    { url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', filtered: true },
  ],
  satellite: [
    { url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}' },
    { url: 'https://webst0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}' },
  ],
};

const BASE_LAYER_FLAG = '__kbBaseLayer';

/** 切换底图：先摘掉旧底图层（只摘自己打的标记层，不动飞线/点位），再挂新的 */
export function applyBaseMapStyle(map: L.Map, style: BaseMapStyle) {
  const stale: L.Layer[] = [];
  map.eachLayer((layer) => {
    if ((layer as unknown as Record<string, unknown>)[BASE_LAYER_FLAG]) stale.push(layer);
  });
  stale.forEach((layer) => map.removeLayer(layer));

  BASE_LAYERS[style].forEach((config, index) => {
    const tile = L.tileLayer(config.url, {
      maxZoom: 19,
      subdomains: '1234',
      className: config.filtered ? 'platform-map-tiles' : undefined,
      zIndex: index + 1,
    }).addTo(map);
    (tile as unknown as Record<string, unknown>)[BASE_LAYER_FLAG] = true;
    if (config.filtered) tile.on('load', () => tile.getContainer()?.classList.add('tiles-loaded'));
  });
}

export const MAP_LAYER_STYLES = `
.line-tooltip{background:rgba(255,255,255,.96);border:1px solid rgba(226,232,240,.9);border-radius:10px;box-shadow:0 10px 28px rgba(15,23,42,.18),0 2px 6px rgba(15,23,42,.06);padding:10px 12px;color:#0f172a;backdrop-filter:blur(8px)}
.line-tooltip::before{display:none}
.line-tooltip-content{min-width:210px;max-width:290px}
.line-tooltip-title{font-size:12.5px;font-weight:600;color:#0f172a;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid #f1f5f9}
.line-tooltip-row{display:flex;align-items:center;justify-content:space-between;gap:16px;font-size:11px;line-height:20px}
.line-tooltip-row span{color:#64748b;white-space:nowrap}
.line-tooltip-row b{font-weight:600;color:#0f172a;text-align:right}
.line-tooltip-sep{margin:7px 0 3px;font-size:10px;font-weight:600;letter-spacing:.04em;color:#94a3b8;border-top:1px dashed #e2e8f0;padding-top:6px}
.line-tooltip-hint{margin-top:7px;padding-top:6px;border-top:1px solid #f1f5f9;font-size:10px;color:#94a3b8;text-align:center}

/* 标题行：点位名 + 风险等级徽标（航哥 20261123 要求浮窗呈现风险等级） */
.line-tooltip-head{display:flex;align-items:center;gap:6px;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid #f1f5f9}
.line-tooltip-head .t{font-size:12.5px;font-weight:600;color:#0f172a;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.risk-tag{flex:none;font-size:10px;font-weight:600;line-height:16px;padding:0 6px;border-radius:8px;border:1px solid transparent;white-space:nowrap}
.risk-high{background:#fef2f2;color:#b91c1c;border-color:#fecaca}
.risk-mid{background:#fff7ed;color:#c2410c;border-color:#fed7aa}
.risk-low{background:#fefce8;color:#a16207;border-color:#fde68a}
.risk-manual{background:#f5f3ff;color:#6d28d9;border-color:#ddd6fe}

/* 「查看对应车辆 / 查看对应运单」链接按钮（航哥 20261123） */
.line-tooltip-actions{display:flex;gap:6px;margin-top:8px;padding-top:7px;border-top:1px solid #f1f5f9}
.tt-action{flex:1;text-align:center;font-size:11px;font-weight:600;line-height:24px;border-radius:6px;cursor:pointer;
  background:#f8fafc;color:#334155;border:1px solid #e2e8f0;transition:background .12s,border-color .12s}
.tt-action:hover{background:#eef2ff;border-color:#a5b4fc;color:#3730a3}

/* 轨迹上的「敏感区域停靠N」序号浮窗：序号徽标用点位风险色，与地图标记同色可对照 */
.stop-seq{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;
  border-radius:9px;color:#fff;font-size:10.5px;font-weight:700;margin-right:6px;vertical-align:-3px}

/* 轨迹上的「敏感区域停靠N」序号标记：divIcon（circleMarker 画不了文字）。
   底色 = 该点位的风险色，与浮窗里的序号徽标同色，一眼能对上 */
.stop-num-icon{background:transparent;border:0}
.stop-num{display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;
  border:2.5px solid #fff;box-shadow:0 2px 8px rgba(15,23,42,.35);
  color:#fff;font-size:11.5px;font-weight:700;font-family:ui-sans-serif,system-ui,sans-serif;cursor:pointer}
.stop-num.sel{width:30px;height:30px;font-size:14px;border-width:3px}

/* 播放游标：**真卡车图标**（航哥 20261123：「你给我整一个这个卡车啊，真的是卡车」，
   原黑色三角已废）。白描边 + 深色车身，标准图与卫星图上都清晰；车头朝右 = 前进方向 */
.play-truck{width:30px;height:20px;filter:drop-shadow(0 2px 4px rgba(15,23,42,.5))}
.play-truck svg{display:block;width:30px;height:20px}

/* 起终点标记（航哥 20261123 二次修正：「就一个「起」和「终」就行了，没有必要区分它是实心还是空心」）
   → **两端同款黑圆，靠圆内的「起」/「终」文字区分**，不再用实心/空心。
   原 .ep-dot（实心）/ .ep-ring（空心）已废 */
.ep-icon{background:transparent;border:0}
.ep-label{display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;
  background:#0f172a;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(15,23,42,.4);
  color:#fff;font-size:11.5px;font-weight:700;line-height:1;
  font-family:ui-sans-serif,system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}

/* Leaflet 自带关闭叉号：默认样式在小浮窗里偏大偏灰，收紧一点（航哥要求右上角可关闭） */
.line-tooltip .leaflet-popup-content-wrapper{padding:10px 26px 10px 12px;border-radius:10px}
.line-tooltip .leaflet-popup-close-button{top:5px!important;right:5px!important;width:18px;height:18px;
  font-size:15px;line-height:16px;color:#94a3b8;padding:0}
.line-tooltip .leaflet-popup-close-button:hover{color:#334155}
.line-tooltip .leaflet-popup-content{margin:0}
`;
