import { RETENTION_DATA } from './data';
import type { TreeNode } from './types';
import { NW, centerY } from './layout';

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

function buildRetentionSVG(): SVGSVGElement {
  const W = 248, H = 140, ml = 8, mr = 4, mt = 20, mb = 18;
  const cw = W - ml - mr, ch = H - mt - mb, cb = mt + ch;
  const bw = 16, bg = (cw - RETENTION_DATA.length * bw) / (RETENTION_DATA.length - 1);
  const bxx = (i: number) => ml + i * (bw + bg);
  const pyy = (p: number) => cb - (p / 100) * ch;

  const svg = mkEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H }) as SVGSVGElement;
  svg.style.display = 'block';

  const defs = document.createElementNS(NS, 'defs');
  defs.innerHTML = `<pattern id="rdh" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
    <line x1="0" y1="6" x2="6" y2="0" stroke="#2C4B8A" stroke-width="1.8" stroke-opacity="0.42"/>
  </pattern>`;
  svg.appendChild(defs);

  mkText('retention funnel · 28-day program', {
    x: W / 2, y: 13, 'text-anchor': 'middle',
    fill: '#AEADA8', 'font-size': 7, 'font-weight': 700,
    'font-family': 'Space Mono,monospace', 'letter-spacing': '0.06em',
  }, svg);

  mkEl('line', { x1: ml, y1: cb, x2: ml + cw, y2: cb, stroke: '#DDDAD4', 'stroke-width': 0.8 }, svg);

  RETENTION_DATA.forEach((d, i) => {
    const prev = i === 0 ? 100 : RETENTION_DATA[i - 1].pct;
    const x = bxx(i);
    const sY = pyy(d.pct), sH = (d.pct / 100) * ch;
    const hY = pyy(prev), hH = ((prev - d.pct) / 100) * ch;
    const isLast = i === RETENTION_DATA.length - 1;

    if (hH > 0.3) mkEl('rect', { x, y: hY, width: bw, height: hH, fill: 'url(#rdh)' }, svg);
    if (sH > 0.3) mkEl('rect', { x, y: sY, width: bw, height: sH, fill: isLast ? '#B52B1E' : '#2C4B8A' }, svg);

    if (i === 0) {
      mkText('100%', {
        x: x + bw / 2, y: sY + 10, 'text-anchor': 'middle',
        fill: '#fff', 'font-size': 6, 'font-weight': 700,
        'font-family': 'Space Mono,monospace',
      }, svg);
    } else {
      const ly = Math.max(Math.min(hH > 0.3 ? hY : sY, sY) - 2, mt + 2);
      mkText(String(d.pct) + '%', {
        x: x + bw / 2, y: ly, 'text-anchor': 'middle',
        fill: isLast ? '#B52B1E' : '#B0AFA9',
        'font-size': isLast ? 7.5 : 6,
        'font-weight': isLast ? 700 : 400,
        'font-family': 'Space Mono,monospace',
      }, svg);
    }

    mkText(d.s, {
      x: x + bw / 2, y: cb + 11, 'text-anchor': 'middle',
      fill: '#CFCECA', 'font-size': 5.5, 'font-family': 'Space Mono,monospace',
    }, svg);
  });

  return svg;
}

export function mountRetentionWidget(
  canvas: HTMLElement,
  p28Node: TreeNode,
  daysNode: TreeNode,
  getSelectionState: (n: TreeNode) => 'act' | 'dim' | 'par' | 'def',
): { update: () => void } {
  let hideTimer = 0;

  const marker = document.createElement('div');
  marker.id = 'ret-marker';
  marker.textContent = '/';
  canvas.appendChild(marker);

  const popup = document.createElement('div');
  popup.id = 'ret-popup';
  popup.appendChild(buildRetentionSVG());

  const co = document.createElement('div');
  co.style.cssText = 'margin-top:8px;font-size:8.5px;color:#B52B1E;font-weight:700;letter-spacing:0.02em;';
  co.textContent = '6.10% complete the full 28-day cycle';
  popup.appendChild(co);

  const sl = document.createElement('div');
  sl.style.cssText = 'margin-top:3px;font-size:7.5px;color:#AEADA8;';
  sl.textContent = '93.9% of all starters never reach day 28';
  popup.appendChild(sl);

  canvas.appendChild(popup);

  marker.addEventListener('mouseenter', () => {
    clearTimeout(hideTimer);
    popup.style.display = 'block';
  });
  marker.addEventListener('mouseleave', () => {
    hideTimer = window.setTimeout(() => { popup.style.display = 'none'; }, 150);
  });
  popup.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  popup.addEventListener('mouseleave', () => { popup.style.display = 'none'; });

  function update() {
    const mx = (p28Node.x! + NW + daysNode.x!) / 2;
    const my = (centerY(p28Node) + centerY(daysNode)) / 2;
    marker.style.left = (mx - 11) + 'px';
    marker.style.top  = (my - 11) + 'px';
    popup.style.left  = (mx + 18) + 'px';
    popup.style.top   = (my - 104) + 'px';

    marker.classList.remove('mk-act', 'mk-dim');
    const st = getSelectionState(p28Node);
    if (st === 'act') marker.classList.add('mk-act');
    if (st === 'dim') marker.classList.add('mk-dim');
  }

  return { update };
}
