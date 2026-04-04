import { RETENTION_DATA } from './data';
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

export function buildChart(data: RetentionPoint[]): SVGSVGElement {
  const W = 248, H = 140, ml = 8, mr = 4, mt = 20, mb = 18;
  const cw = W - ml - mr, ch = H - mt - mb, cb = mt + ch;
  const n = data.length;
  const bw = Math.max(6, Math.min(20, Math.floor((cw - (n - 1) * 3) / n)));
  const bg = n > 1 ? (cw - n * bw) / (n - 1) : 0;
  const bxx = (i: number) => ml + i * (bw + bg);
  const max = data[0]?.pct ?? 100;
  const pyy = (p: number) => cb - (p / max) * ch;

  const svg = mkEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H }) as SVGSVGElement;
  svg.style.display = 'block';

  const defs = document.createElementNS(NS, 'defs');
  defs.innerHTML = `<pattern id="rdh" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
    <line x1="0" y1="6" x2="6" y2="0" stroke="#2C4B8A" stroke-width="1.8" stroke-opacity="0.42"/>
  </pattern>`;
  svg.appendChild(defs);

  mkText('retention funnel', {
    x: W / 2, y: 13, 'text-anchor': 'middle',
    fill: '#AEADA8', 'font-size': 7, 'font-weight': 700,
    'font-family': 'LatteraMonoLL,Space Mono,monospace', 'letter-spacing': '0.06em',
  }, svg);

  mkEl('line', { x1: ml, y1: cb, x2: ml + cw, y2: cb, stroke: '#DDDAD4', 'stroke-width': 0.8 }, svg);

  data.forEach((d, i) => {
    const prev = i === 0 ? max : data[i - 1].pct;
    const x = bxx(i);
    const sY = pyy(d.pct), sH = (d.pct / max) * ch;
    const hH = ((prev - d.pct) / max) * ch;
    const hY = pyy(prev);
    const isLast = i === data.length - 1;

    if (hH > 0.3) mkEl('rect', { x, y: hY, width: bw, height: hH, fill: 'url(#rdh)' }, svg);
    if (sH > 0.3) mkEl('rect', { x, y: sY, width: bw, height: sH, fill: isLast ? '#B52B1E' : '#2C4B8A' }, svg);

    const labelY = Math.max(Math.min(hH > 0.3 ? hY : sY, sY) - 2, mt + 2);
    mkText(d.pct + '%', {
      x: x + bw / 2, y: i === 0 ? sY + 10 : labelY, 'text-anchor': 'middle',
      fill: i === 0 ? '#fff' : isLast ? '#B52B1E' : '#B0AFA9',
      'font-size': isLast ? 7.5 : 6,
      'font-weight': (i === 0 || isLast) ? 700 : 400,
      'font-family': 'LatteraMonoLL,Space Mono,monospace',
    }, svg);

    mkText(d.s, {
      x: x + bw / 2, y: cb + 11, 'text-anchor': 'middle',
      fill: '#CFCECA', 'font-size': 5.5, 'font-family': 'LatteraMonoLL,Space Mono,monospace',
    }, svg);
  });

  return svg;
}

export function mountRetentionWidget(
  getData: () => RetentionPoint[],
  onDataChange: (data: RetentionPoint[]) => void,
): { refresh: () => void } {
  // ── Marker button (fixed, bottom-right) ──────────────────────────────────────
  const marker = document.createElement('div');
  marker.id = 'ret-marker';
  marker.textContent = '/';
  document.body.appendChild(marker);

  // ── Popup ────────────────────────────────────────────────────────────────────
  const popup = document.createElement('div');
  popup.id = 'ret-popup';
  document.body.appendChild(popup);

  let hideTimer = 0;

  marker.addEventListener('mouseenter', () => { clearTimeout(hideTimer); popup.style.display = 'block'; });
  marker.addEventListener('mouseleave', () => { hideTimer = window.setTimeout(() => { popup.style.display = 'none'; }, 150); });
  popup.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  popup.addEventListener('mouseleave', () => { popup.style.display = 'none'; });

  // ── Render popup content ─────────────────────────────────────────────────────
  function renderPopup() {
    popup.innerHTML = '';
    const data = getData();

    // Chart
    const chartWrap = document.createElement('div');
    chartWrap.appendChild(buildChart(data));
    popup.appendChild(chartWrap);

    // Summary
    if (data.length >= 2) {
      const last = data[data.length - 1];
      const co = document.createElement('div');
      co.className = 'ret-summary';
      co.textContent = `${last.pct}% reach the final stage`;
      popup.appendChild(co);
    }

    // Divider
    const hr = document.createElement('div');
    hr.className = 'ret-divider';
    popup.appendChild(hr);

    // Editable table
    const table = document.createElement('div');
    table.className = 'ret-table';

    data.forEach((pt, i) => {
      const row = document.createElement('div');
      row.className = 'ret-row';

      // Label input
      const lblInp = document.createElement('input');
      lblInp.className = 'ret-inp ret-inp-lbl';
      lblInp.value = pt.s;
      lblInp.placeholder = 'label';
      lblInp.addEventListener('input', () => {
        data[i] = { ...data[i], s: lblInp.value.trim() || pt.s };
        onDataChange([...data]);
        // Rebuild chart only (not full popup to avoid losing focus)
        chartWrap.innerHTML = '';
        chartWrap.appendChild(buildChart(getData()));
      });
      row.appendChild(lblInp);

      // Percent input
      const pctInp = document.createElement('input');
      pctInp.className = 'ret-inp ret-inp-pct';
      pctInp.type = 'number';
      pctInp.min = '0';
      pctInp.max = '100';
      pctInp.step = '0.1';
      pctInp.value = String(pt.pct);
      pctInp.addEventListener('input', () => {
        const v = Math.min(100, Math.max(0, parseFloat(pctInp.value) || 0));
        data[i] = { ...data[i], pct: v };
        onDataChange([...data]);
        chartWrap.innerHTML = '';
        chartWrap.appendChild(buildChart(getData()));
      });
      row.appendChild(pctInp);

      const pctLabel = document.createElement('span');
      pctLabel.className = 'ret-pct-unit';
      pctLabel.textContent = '%';
      row.appendChild(pctLabel);

      // Delete row (keep at least 2)
      if (data.length > 2) {
        const delBtn = document.createElement('button');
        delBtn.className = 'ret-row-del';
        delBtn.textContent = '×';
        delBtn.addEventListener('click', () => {
          data.splice(i, 1);
          onDataChange([...data]);
          renderPopup();
        });
        row.appendChild(delBtn);
      }

      table.appendChild(row);
    });

    // Add row button
    const addBtn = document.createElement('button');
    addBtn.className = 'ret-add-row';
    addBtn.textContent = '+ Add stage';
    addBtn.addEventListener('click', () => {
      const last = data[data.length - 1];
      data.push({ s: `+${data.length}`, pct: Math.max(0, (last?.pct ?? 10) - 5) });
      onDataChange([...data]);
      renderPopup();
    });
    table.appendChild(addBtn);
    popup.appendChild(table);

    // Reset to defaults button
    const resetBtn = document.createElement('button');
    resetBtn.className = 'ret-reset';
    resetBtn.textContent = 'Reset to defaults';
    resetBtn.addEventListener('click', () => {
      onDataChange([...RETENTION_DATA]);
      renderPopup();
    });
    popup.appendChild(resetBtn);
  }

  // Re-render popup when it becomes visible
  marker.addEventListener('mouseenter', renderPopup);

  function refresh() {
    // Keep marker state in sync — position is fixed, nothing to update
  }

  return { refresh };
}
