export function dispatchTruckContent(color: string, headingDegrees: number, plate?: string, address?: string) {
  const root = document.createElement('div');
  root.className = 'dispatch-truck-marker';
  root.style.borderColor = color;
  root.style.color = color;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '25');
  svg.setAttribute('height', '25');
  svg.setAttribute('fill', 'currentColor');
  svg.style.transform = `rotate(${headingDegrees + 90}deg)`;
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M12 2 21 21 12 17 3 21Z');
  svg.append(path);
  root.append(svg);
  if (plate || address) {
    const label = document.createElement('span');
    label.className = 'dispatch-vehicle-address';
    const strong = document.createElement('strong');
    strong.textContent = plate ?? '当前车辆';
    const place = document.createElement('span');
    place.textContent = address || '位置地址待获取';
    label.append(strong, place);
    root.append(label);
  }
  return root;
}

export function dispatchMarkerContent(label: string, color: string, dx = 0, dy = -33) {
  const root = document.createElement('div');
  root.className = 'dispatch-map-callout';
  const anchor = document.createElement('span');
  anchor.className = 'dispatch-map-anchor';
  const line = document.createElement('span');
  line.className = 'dispatch-map-leader';
  const lineEndY = dy + 26;
  line.style.left = '40px';
  line.style.top = '40px';
  line.style.width = `${Math.hypot(dx, lineEndY)}px`;
  line.style.transform = `rotate(${Math.atan2(lineEndY, dx)}rad)`;
  const pin = document.createElement('span');
  pin.className = 'dispatch-map-pin';
  pin.style.left = `${40 + dx - 13}px`;
  pin.style.top = `${40 + dy}px`;
  pin.style.background = color;
  pin.textContent = label;
  root.append(anchor, line, pin);
  return root;
}

export function dispatchInfoContent(title: string, rows: [string, string][]) {
  const node = document.createElement('div');
  node.className = 'dispatch-map-info';
  const heading = document.createElement('strong');
  heading.textContent = title;
  node.append(heading);
  for (const [label, value] of rows) {
    const body = document.createElement('p');
    const key = document.createElement('span');
    key.textContent = `${label}：`;
    body.append(key, document.createTextNode(value));
    node.append(body);
  }
  return node;
}
