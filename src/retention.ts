import type { RetentionPoint } from './types';

const NS = 'http://www.w3.org/2000/svg';

function mkEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: SVGElement,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  parent?.appendChild(el);
  return el;
}

function mkText(text: string, attrs: Record<string, string | number>, parent: SVGElement): SVGTextElement {
  const el = mkEl('text', attrs, parent);
  el.textContent = text;
  return el;
}

export function buildChart(data: RetentionPoint[], highlightFrom = 0): SVGSVGElement {
  const W = 248, H = 140, ml = 8, mr = 4, mt = 20, mb = 18;
  const cw = W - ml - mr, ch = H - mt - mb, cb = mt + ch;
  const n = data.length;
  const gap = 4;
  const bw = Math.min(32, Math.max(6, Math.floor((cw - (n - 1) * gap) / n)));
  const groupW = n * bw + (n - 1) * gap;
  const bxx = (i: number) => ml + (cw - groupW) / 2 + i * (bw + gap);
  const max = highlightFrom > 0 ? 100 : (data[0]?.pct ?? 100);
  const pyy = (p: number) => cb - (p / max) * ch;

  const svg = mkEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H }) as SVGSVGElement;
  svg.style.display = 'block';

  const defs = document.createElementNS(NS, 'defs');
  defs.innerHTML = `<pattern id="rdh" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
    <line x1="0" y1="6" x2="6" y2="0" stroke="#2C4B8A" stroke-width="1.8" stroke-opacity="0.42"/>
  </pattern>
  <pattern id="rdh-dim" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
    <line x1="0" y1="6" x2="6" y2="0" stroke="#3A4050" stroke-width="1.2" stroke-opacity="0.35"/>
  </pattern>`;
  svg.appendChild(defs);

  mkText('retention funnel', {
    x: W / 2, y: 13, 'text-anchor': 'middle',
    fill: '#AEADA8', 'font-size': 7, 'font-weight': 700,
    'font-family': 'LatteraMonoLL,Space Mono,monospace', 'letter-spacing': '0.06em',
  }, svg);

  mkEl('line', { x1: ml, y1: cb, x2: ml + cw, y2: cb, stroke: '#DDDAD4', 'stroke-width': 0.8 }, svg);

  // Separator between prior-chain vs current-edge points.
  if (highlightFrom > 0 && highlightFrom < data.length) {
    const sepX = bxx(highlightFrom) - gap / 2;
    mkEl('line', { x1: sepX, y1: mt, x2: sepX, y2: cb, stroke: '#4A6A4A', 'stroke-width': 0.8, 'stroke-dasharray': '3 2' }, svg);
  }

  data.forEach((d, i) => {
    const prev = i === 0 ? max : data[i - 1].pct;
    const isCurrent = i >= highlightFrom;
    const x = bxx(i);
    const sY = pyy(d.pct), sH = (d.pct / max) * ch;
    const hH = ((prev - d.pct) / max) * ch;
    const hY = pyy(prev);
    const isLast = i === data.length - 1;

    if (hH > 0.3) mkEl('rect', { x, y: hY, width: bw, height: hH, fill: isCurrent ? 'url(#rdh)' : 'url(#rdh-dim)' }, svg);
    if (sH > 0.3) mkEl('rect', {
      x, y: sY, width: bw, height: sH,
      fill: isCurrent ? (isLast ? '#B52B1E' : '#2C4B8A') : '#353A50',
    }, svg);

    if (isCurrent || i === 0) {
      const labelY = Math.max(Math.min(hH > 0.3 ? hY : sY, sY) - 2, mt + 2);
      mkText(d.pct + '%', {
        x: x + bw / 2, y: i === 0 ? sY + 10 : labelY, 'text-anchor': 'middle',
        fill: i === 0 ? '#fff' : isLast ? '#B52B1E' : '#B0AFA9',
        'font-size': isLast ? 7.5 : 6,
        'font-weight': (i === 0 || isLast) ? 700 : 400,
        'font-family': 'LatteraMonoLL,Space Mono,monospace',
      }, svg);
    }

    mkText(d.s, {
      x: x + bw / 2, y: cb + 11, 'text-anchor': 'middle',
      fill: isCurrent ? '#CFCECA' : '#4A4E5A',
      'font-size': 5.5, 'font-family': 'LatteraMonoLL,Space Mono,monospace',
    }, svg);
  });

  return svg;
}

