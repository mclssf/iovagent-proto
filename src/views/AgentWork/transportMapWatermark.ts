import { Screenshot } from '@amap/screenshot';
import sinoiovLogoUrl from '@/assets/imgs/sinoiov-logo.png';
import type { AMapCoordinate } from '@/utils/amap';
import { evidenceTime, hasEvidenceMapDetails } from './waybillEvidence';

export interface TransportMapWatermarkData {
  enterprise: string;
  plate: string;
  order: string;
  loading: { poi: string; coordinate?: AMapCoordinate; time: string };
  unloading: TransportMapWatermarkData['loading'];
  distance: string;
  period: string;
}

function text(tag: string, value: string, css = '') {
  const element = document.createElement(tag);
  element.textContent = value;
  element.style.cssText = css;
  return element;
}

// The detail page and batch screenshots use the same in-map DOM, not a second image layout.
export function mountTransportMapWatermark(map: AMap.Map, data: TransportMapWatermarkData, options: { topInset?: number } = {}) {
  const container = map.getContainer();
  const root = document.createElement('div');
  root.dataset.transportWatermark = 'true';
  root.setAttribute('aria-label', '运输轨迹水印');
  root.style.cssText = 'position:absolute;inset:0;z-index:500;pointer-events:none;font-family:sans-serif;color:#253440;font-size:12px;line-height:1.5;letter-spacing:0;overflow:hidden;background:transparent;text-shadow:0 1px 2px #ffffff,1px 0 2px #ffffff,-1px 0 2px #ffffff;';
  const header = document.createElement('div');
  header.dataset.watermarkPart = 'header';
  header.style.cssText = `position:absolute;top:${options.topInset ?? 24}px;left:24px;right:112px;background:transparent;`;
  const identity = document.createElement('div');
  identity.style.cssText = 'min-width:0;overflow-wrap:anywhere;';
  const logo = document.createElement('img');
  logo.src = sinoiovLogoUrl;
  logo.alt = '兴路车联';
  logo.width = 160;
  logo.height = 37;
  logo.style.cssText = 'display:block;width:160px;max-width:100%;height:auto;aspect-ratio:4109/952;object-fit:contain;object-position:left;';
  identity.append(
    logo,
    text('div', '监控运输轨迹', 'margin-top:10px;font-size:16px;font-weight:600;color:#1f2933;'),
    text('div', `车牌号 ${data.plate}  ·  运单号 ${data.order}`, 'margin-top:4px;font-weight:600;'),
    text('div', `所属企业：${data.enterprise}`, 'margin-top:3px;color:#465663;'),
  );
  header.append(identity);
  const pattern = document.createElement('div');
  pattern.setAttribute('aria-hidden', 'true');
  pattern.style.cssText = 'position:absolute;inset:25% 4% 25%;display:flex;flex-direction:column;justify-content:space-around;align-items:center;overflow:hidden;text-shadow:none;';
  for (let index = 0; index < 3; index++) pattern.append(text('div', `${data.enterprise}  ·  ${data.plate}`, 'max-width:92%;overflow-wrap:anywhere;text-align:center;transform:rotate(-20deg);font-size:20px;font-weight:600;color:rgba(36,73,106,.17);'));
  const footer = document.createElement('div');
  footer.dataset.watermarkPart = 'footer';
  footer.style.cssText = 'position:absolute;left:24px;right:68px;bottom:36px;background:transparent;';
  const endpoints = document.createElement('div');
  endpoints.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;';
  for (const [title, endpoint, color] of [['装货', data.loading, '#267457'], ['卸货', data.unloading, '#a44b2b']] as const) {
    const block = document.createElement('div');
    block.dataset.watermarkPart = title === '装货' ? 'loading' : 'unloading';
    block.style.cssText = 'min-width:0;overflow-wrap:anywhere;padding:10px 12px;border-radius:6px;background:rgba(255,255,255,.82);text-shadow:none;';
    block.append(
      text('div', title, `font-size:13px;font-weight:600;color:${color};`),
      text('div', endpoint.poi, 'margin-top:4px;font-size:13px;color:#253440;'),
      text('div', `经纬度：${endpoint.coordinate?.map(value => value.toFixed(6)).join(', ') ?? '加载中'}（GCJ-02）`, 'margin-top:4px;color:#465663;'),
      text('div', `${title}时间：${endpoint.time}`, 'margin-top:3px;color:#465663;'),
    );
    endpoints.append(block);
  }
  const journey = document.createElement('div');
  journey.dataset.watermarkPart = 'journey';
  journey.style.cssText = 'margin-top:10px;padding:8px 12px;border-radius:6px;background:rgba(255,255,255,.82);text-shadow:none;';
  journey.append(
    text('div', `运输时间：${data.period}（北京时间）`, 'font-weight:600;overflow-wrap:anywhere;'),
    text('div', `道路里程 ${data.distance}  ·  生成时间 ${evidenceTime(Date.now())}`, 'margin-top:3px;color:#465663;overflow-wrap:anywhere;'),
  );
  footer.append(endpoints, journey);
  root.append(pattern, header, footer);
  container.append(root);
  const resize = () => {
    endpoints.style.gridTemplateColumns = container.clientWidth < 520 ? 'minmax(0,1fr)' : 'repeat(2,minmax(0,1fr))';
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  return {
    element: root,
    // AMap uses top, bottom, left, right rather than CSS shorthand order.
    padding: () => [header.offsetTop + header.offsetHeight + 48, footer.offsetHeight + 84, 48, 68] as [number, number, number, number],
    destroy() { observer.disconnect(); root.remove(); },
  };
}

export async function captureTransportMap(map: AMap.Map, signal: AbortSignal) {
  const screenshot = new Screenshot(map);
  const watermark = map.getContainer().querySelector<HTMLElement>('[data-transport-watermark]');
  const visibility = watermark?.style.visibility ?? '';
  function bounded<T>(promise: Promise<T>, milliseconds = 20000) {
    return new Promise<T>((resolve, reject) => {
      const abort = () => finish(() => reject(new DOMException('截图已取消', 'AbortError')));
      const timer = setTimeout(() => finish(() => reject(new Error('截图生成超时，请稍后重试'))), milliseconds);
      function finish(action: () => void) { clearTimeout(timer); signal.removeEventListener('abort', abort); action(); }
      if (signal.aborted) { abort(); return; }
      signal.addEventListener('abort', abort, { once: true });
      promise.then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
    });
  }
  try {
    // Validate the base map without counting overlay text as geographic detail.
    if (watermark) watermark.style.visibility = 'hidden';
    let base: HTMLCanvasElement | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      base = await bounded(screenshot.toCanvas() as Promise<HTMLCanvasElement>);
      const context = base.getContext('2d');
      if (context && base.width && base.height && hasEvidenceMapDetails(context.getImageData(0, 0, base.width, base.height).data, base.width, base.height)) break;
      base = undefined;
      if (!attempt) await bounded(new Promise(resolve => setTimeout(resolve, 2000)));
    }
    if (!base) throw new Error('地图底图未完整加载，请稍后重试；未生成截图');
    if (watermark) watermark.style.visibility = visibility;
    const canvas = watermark && visibility !== 'hidden' ? await bounded(screenshot.toCanvas() as Promise<HTMLCanvasElement>) : base;
    const encoded = canvas.toDataURL('image/jpeg', .9).split(',')[1]!;
    return Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
  } finally {
    if (watermark) watermark.style.visibility = visibility;
    screenshot.destroy();
  }
}
