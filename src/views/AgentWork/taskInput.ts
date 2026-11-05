const DAY = 86400000;

export function recordValue(record: Record<string, string>, fields: string[]) {
  for (const field of fields) {
    const value = Object.entries(record).find(([key]) => key.replace(/\s/g, '').toLowerCase() === field.toLowerCase())?.[1];
    if (value?.trim()) return value.trim();
  }
  return '';
}

export function extractTaskPlates(prompt: string) {
  return [...new Set(prompt.toUpperCase().match(/[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-Z][A-Z0-9]{5,6}/g) ?? [])];
}

export function parseWaybillTimestamp(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  if (/^\d{10}(?:\d{3})?$/.test(text)) return Number(text) * (text.length === 10 ? 1000 : 1);
  if (/^\d{1,7}(?:\.\d+)?$/.test(text)) {
    const serial = Number(text);
    return serial >= 1 && serial <= 2958465 ? Date.UTC(1899, 11, 30) + serial * DAY - 8 * 3600000 : null;
  }
  const normalized = text.replace(/年|月/g, '-').replace(/日/g, '').replace(/\//g, '-');
  const iso = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/i);
  const formatted = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!iso && !formatted) return null;
  const yearText = iso?.[1] ?? formatted![3]!;
  const year = yearText.length === 2 ? Number(yearText) + (Number(yearText) >= 70 ? 1900 : 2000) : Number(yearText);
  const month = Number(iso?.[2] ?? formatted![1]);
  const date = Number(iso?.[3] ?? formatted![2]);
  const hour = Number(iso?.[4] ?? formatted?.[4] ?? 0);
  const minute = Number(iso?.[5] ?? formatted?.[5] ?? 0);
  const second = Number(iso?.[6] ?? formatted?.[6] ?? 0);
  const timestamp = Date.UTC(year, month - 1, date, hour, minute, second);
  const check = new Date(timestamp);
  if (year < 1900 || check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== date || hour > 23 || minute > 59 || second > 59) return null;
  if (iso?.[7]) {
    const zoned = Date.parse(`${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}${iso[7]}`);
    return Number.isFinite(zoned) ? zoned : null;
  }
  return timestamp - 8 * 3600000;
}
