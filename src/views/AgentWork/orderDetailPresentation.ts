import type { TimelineEvent, Tone } from './interface';

export function detailRiskTone(verdict?: string, tone?: Tone) {
  if (tone === 'red') return 'danger';
  if (tone === 'orange') return 'warning';
  if (tone === 'green') return 'normal';
  if (verdict === '高风险') return 'danger';
  if (['待核实', '待核验', '中风险', '低风险'].includes(verdict ?? '')) return 'warning';
  if (['正常', '合理', '无风险'].includes(verdict ?? '')) return 'normal';
  return 'neutral';
}

export function detailEventDuration(event: TimelineEvent) {
  const recorded = event.desc.match(/停车\s*(\d+)\s*分钟/);
  if (recorded) return `${recorded[1]} 分钟`;
  const range = event.time.match(/^(次日\s*)?(\d{1,2}):(\d{2})\s*[-–—]\s*(次日\s*)?(\d{1,2}):(\d{2})$/);
  if (!range) return '';
  const [, startDay, startHour, startMinute, endDay, endHour, endMinute] = range;
  if (Number(startHour) > 23 || Number(endHour) > 23 || Number(startMinute) > 59 || Number(endMinute) > 59) return '';
  const start = Number(startHour) * 60 + Number(startMinute) + (startDay ? 1440 : 0);
  const end = Number(endHour) * 60 + Number(endMinute) + (endDay ? 1440 : 0);
  return end > start ? `${end - start} 分钟` : '';
}

export function detailEventConclusion(event: TimelineEvent) {
  const content = event.agent || event.desc;
  const sentence = content.split(/[。；]/)[0] ?? '';
  return (event.agent ? sentence.split('，').at(-1) : sentence) || '—';
}

export function detailEventSupplement(event: TimelineEvent) {
  const content = event.agent || event.desc;
  return content.replace(/[。；]+$/, '') !== detailEventConclusion(event) ? content : '';
}
