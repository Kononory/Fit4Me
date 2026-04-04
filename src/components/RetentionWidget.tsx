import { useState, useRef, useCallback, useEffect } from 'react';
import { buildChart } from '../retention';
import { RETENTION_DATA } from '../data';
import type { RetentionPoint } from '../types';
import { useStore } from '../store';

export function RetentionWidget() {
  const { getActive, setFlows, flows, activeId } = useStore();
  const [open, setOpen] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef(0);

  const getData = useCallback((): RetentionPoint[] => {
    return getActive().retentionData ?? [...RETENTION_DATA];
  }, [getActive]);

  const saveData = useCallback((data: RetentionPoint[]) => {
    const updated = flows.map(f => f.id === activeId ? { ...f, retentionData: data } : f);
    setFlows(updated);
  }, [flows, activeId, setFlows]);

  const [data, setData] = useState<RetentionPoint[]>(() => getData());

  // Sync data when active flow changes
  useEffect(() => { setData(getData()); }, [activeId, getData]);

  // Rebuild chart whenever data changes
  useEffect(() => {
    const el = chartRef.current; if (!el) return;
    el.innerHTML = '';
    el.appendChild(buildChart(data));
  }, [data]);

  const updateRow = useCallback((i: number, patch: Partial<RetentionPoint>) => {
    setData(prev => {
      const next = prev.map((d, idx) => idx === i ? { ...d, ...patch } : d);
      saveData(next);
      return next;
    });
  }, [saveData]);

  const deleteRow = useCallback((i: number) => {
    setData(prev => {
      const next = prev.filter((_, idx) => idx !== i);
      saveData(next);
      return next;
    });
  }, [saveData]);

  const addRow = useCallback(() => {
    setData(prev => {
      const next = [...prev, { s: `+${prev.length}`, pct: Math.max(0, (prev[prev.length - 1]?.pct ?? 10) - 5) }];
      saveData(next);
      return next;
    });
  }, [saveData]);

  const reset = useCallback(() => {
    const d = [...RETENTION_DATA];
    setData(d);
    saveData(d);
  }, [saveData]);

  const showPopup  = () => { clearTimeout(hideTimer.current); setOpen(true); setData(getData()); };
  const startHide  = () => { hideTimer.current = window.setTimeout(() => setOpen(false), 150); };
  const cancelHide = () => clearTimeout(hideTimer.current);

  const last = data[data.length - 1];

  return (
    <>
      <div id="ret-marker"
        onMouseEnter={showPopup}
        onMouseLeave={startHide}>
        /
      </div>

      {open && (
        <div id="ret-popup" onMouseEnter={cancelHide} onMouseLeave={() => setOpen(false)}>
          <div ref={chartRef} />
          {data.length >= 2 && (
            <div className="ret-summary">{last?.pct}% reach the final stage</div>
          )}
          <div className="ret-divider" />
          <div className="ret-table">
            {data.map((pt, i) => (
              <div key={i} className="ret-row">
                <input className="ret-inp ret-inp-lbl" value={pt.s} placeholder="label"
                  onChange={e => updateRow(i, { s: e.target.value.trim() || pt.s })} />
                <input className="ret-inp ret-inp-pct" type="number" min={0} max={100} step={0.1} value={pt.pct}
                  onChange={e => updateRow(i, { pct: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })} />
                <span className="ret-pct-unit">%</span>
                {data.length > 2 && (
                  <button className="ret-row-del" onClick={() => deleteRow(i)}>×</button>
                )}
              </div>
            ))}
            <button className="ret-add-row" onClick={addRow}>+ Add stage</button>
          </div>
          <button className="ret-reset" onClick={reset}>Reset to defaults</button>
        </div>
      )}
    </>
  );
}
