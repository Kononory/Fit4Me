import { useEffect, useRef, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import type { TreeNode, CrossEdge, RetentionPoint } from '../types';
import { useStore } from '../store';

// ── Shared positioning helpers ─────────────────────────────────────────────────

function findParent(tree: TreeNode, targetId: string): TreeNode | null {
  for (const child of tree.c ?? []) {
    if (child.id === targetId) return tree;
    const found = findParent(child, targetId);
    if (found) return found;
  }
  return null;
}

function clampX(x: number, width: number) {
  return Math.min(Math.max(x, 156), window.innerWidth - width - 8);
}
function clampY(y: number, height: number) {
  return Math.max(y - height - 10, 38);
}

// ── Main edge annotation picker ────────────────────────────────────────────────

type PickerMode = null | 'main' | 'status' | 'analytics' | 'label-edit' | 'cross-label-edit' | 'cross';

interface PickerState {
  mode: PickerMode;
  toNode: TreeNode | null;
  ce: CrossEdge | null;
  lx: number; ly: number;
  sx: number; sy: number;
}

const INIT: PickerState = { mode: null, toNode: null, ce: null, lx: 0, ly: 0, sx: 0, sy: 0 };

interface Props {
  pickerState: PickerState;
  onClose: () => void;
  onSetMode: (mode: PickerMode, extra?: Partial<PickerState>) => void;
}

export { INIT as PICKER_INIT };
export type { PickerState, PickerMode };

const EDGE_STATUS_OPTS = [
  { val: undefined as TreeNode['edgeStatus'],  icon: '✕' },
  { val: 'up'   as const, icon: '▲', color: '#6B9B5E' },
  { val: 'down' as const, icon: '▽', color: '#B52B1E' },
  { val: 'ok'   as const, icon: '●', color: '#6B9B5E' },
  { val: 'warn' as const, icon: '■', color: '#C8963C' },
];

export function EdgePicker({ pickerState, onClose, onSetMode }: Props) {
  const { pushUndo, updateActiveTree, getActive } = useStore();
  const { mode, toNode, ce, sx, sy } = pickerState;
  const mainRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!mode) return;
    const handler = (e: MouseEvent) => {
      const el = mainRef.current;
      if (el && !el.contains(e.target as Node)) onClose();
    };
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler); };
  }, [mode, onClose]);

  const commit = useCallback((fn: () => void) => {
    onClose();
    pushUndo();
    fn();
    updateActiveTree(getActive().tree);
  }, [onClose, pushUndo, updateActiveTree, getActive]);

  if (!mode || mode === 'label-edit' || mode === 'cross-label-edit' || mode === 'analytics') return null;

  if (mode === 'main' && toNode) {
    const pw = 180;
    const x = clampX(sx - pw / 2, pw);
    const y = clampY(sy, 40);
    return ReactDOM.createPortal(
      <div id="edge-picker" ref={mainRef} style={{ left: x, top: y }}>
        <button className={'ep-btn' + (toNode.edgeLabel ? ' ep-btn-active' : '')}
          onMouseDown={e => { e.stopPropagation(); e.preventDefault(); }}
          onClick={e => { e.stopPropagation(); onSetMode('label-edit'); }}>
          <span className="ep-icon">💬</span><span className="ep-label">Note</span>
        </button>
        <button className={'ep-btn' + (toNode.edgeStatus ? ' ep-btn-active' : '')}
          onMouseDown={e => { e.stopPropagation(); e.preventDefault(); }}
          onClick={e => { e.stopPropagation(); onSetMode('status'); }}>
          <span className="ep-icon">◉</span><span className="ep-label">Status</span>
        </button>
        <button className={'ep-btn' + (toNode.edgeRetention ? ' ep-btn-active' : '')}
          onMouseDown={e => { e.stopPropagation(); e.preventDefault(); }}
          onClick={e => { e.stopPropagation(); onSetMode('analytics'); }}>
          <span className="ep-icon">/</span><span className="ep-label">Analytics</span>
        </button>
      </div>,
      document.body,
    );
  }

  if (mode === 'status' && toNode) {
    const pw = 160;
    const x = clampX(sx - pw / 2, pw);
    const y = clampY(sy, 36);
    return ReactDOM.createPortal(
      <div id="edge-picker" className="ep-status" ref={mainRef} style={{ left: x, top: y }}>
        {EDGE_STATUS_OPTS.map(o => (
          <button key={String(o.val)} className={'ep-st-btn' + (toNode.edgeStatus === o.val ? ' ep-st-active' : '')}
            style={{ color: o.color }}
            onMouseDown={e => { e.stopPropagation(); e.preventDefault(); }}
            onClick={e => { e.stopPropagation(); commit(() => { toNode.edgeStatus = o.val; }); }}>
            {o.icon}
          </button>
        ))}
      </div>,
      document.body,
    );
  }

  if (mode === 'cross' && ce) {
    const pw = 200;
    const x = clampX(sx - pw / 2, pw);
    const y = clampY(sy, 40);
    const flow = getActive();
    return ReactDOM.createPortal(
      <div id="edge-picker" ref={mainRef} style={{ left: x, top: y }}>
        <button className="ep-btn"
          onMouseDown={e => { e.stopPropagation(); e.preventDefault(); }}
          onClick={e => { e.stopPropagation(); commit(() => { ce.type = ce.type === 'back' ? 'ref' : 'back'; }); }}>
          <span className="ep-icon">{ce.type === 'back' ? '↩' : '⤳'}</span>
          <span className="ep-label">{ce.type === 'back' ? '↩ Back' : '⤳ Ref'}</span>
        </button>
        <button className={'ep-btn' + (ce.label ? ' ep-btn-active' : '')}
          onMouseDown={e => { e.stopPropagation(); e.preventDefault(); }}
          onClick={e => { e.stopPropagation(); onSetMode('cross-label-edit'); }}>
          <span className="ep-icon">💬</span><span className="ep-label">Note</span>
        </button>
        <button className="ep-btn ep-btn-del"
          onMouseDown={e => { e.stopPropagation(); e.preventDefault(); }}
          onClick={e => { e.stopPropagation(); commit(() => { flow.crossEdges = (flow.crossEdges ?? []).filter(x => x.id !== ce.id); }); }}>
          <span className="ep-icon">×</span><span className="ep-label">Delete</span>
        </button>
      </div>,
      document.body,
    );
  }

  return null;
}

// ── Floating label-edit input ─────────────────────────────────────────────────

interface LabelEditProps {
  pickerState: PickerState;
  onClose: () => void;
}

export function EdgeLabelEdit({ pickerState, onClose }: LabelEditProps) {
  const { pushUndo, updateActiveTree, getActive } = useStore();
  const { mode, toNode, ce, sx, sy } = pickerState;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const inp = inputRef.current; if (!inp) return;
    inp.focus(); inp.select();
  }, [mode]);

  const commit = useCallback(() => {
    const inp = inputRef.current; if (!inp) return;
    const v = inp.value.trim();
    pushUndo();
    if (mode === 'label-edit' && toNode) toNode.edgeLabel = v || undefined;
    if (mode === 'cross-label-edit' && ce) ce.label = v || undefined;
    updateActiveTree(getActive().tree);
    onClose();
  }, [mode, toNode, ce, pushUndo, updateActiveTree, getActive, onClose]);

  if (mode !== 'label-edit' && mode !== 'cross-label-edit') return null;
  const defaultVal = mode === 'label-edit' ? (toNode?.edgeLabel ?? '') : (ce?.label ?? '');

  return ReactDOM.createPortal(
    <input
      ref={inputRef}
      className="edge-label-input"
      defaultValue={defaultVal}
      placeholder="add note…"
      style={{ left: sx - 50, top: Math.max(sy - 11, 38) }}
      onBlur={commit}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Enter')  { e.preventDefault(); inputRef.current?.removeEventListener('blur', commit); commit(); }
        if (e.key === 'Escape') { inputRef.current?.removeEventListener('blur', commit); onClose(); }
      }}
    />,
    document.body,
  );
}

// ── Analytics popup ────────────────────────────────────────────────────────────

interface AnalyticsProps {
  pickerState: PickerState;
  onClose: () => void;
}

export function EdgeAnalytics({ pickerState, onClose }: AnalyticsProps) {
  const { pushUndo, updateActiveTree, getActive } = useStore();
  const { mode, toNode, sx, sy } = pickerState;
  const [data, setData] = useState<RetentionPoint[]>([]);
  const initialized = useRef(false);

  useEffect(() => {
    if (mode === 'analytics' && toNode && !initialized.current) {
      const fromLabel = findParent(getActive().tree, toNode.id)?.label ?? 'start';
      setData(toNode.edgeRetention ? [...toNode.edgeRetention] : [{ pct: 100, s: fromLabel }, { pct: 0, s: toNode.label }]);
      initialized.current = true;
    }
    if (mode !== 'analytics') initialized.current = false;
  }, [mode, toNode]);

  const syncData = useCallback((newData: RetentionPoint[]) => {
    if (!toNode) return;
    pushUndo();
    toNode.edgeRetention = [...newData];
    updateActiveTree(getActive().tree);
  }, [toNode, pushUndo, updateActiveTree, getActive]);

  const updateRow = useCallback((i: number, patch: Partial<RetentionPoint>) => {
    const next = data.map((d, idx) => idx === i ? { ...d, ...patch } : d);
    setData(next);
    syncData(next);
  }, [data, syncData]);

  const deleteRow = useCallback((i: number) => {
    const next = data.filter((_, idx) => idx !== i);
    setData(next);
    syncData(next);
  }, [data, syncData]);

  const addRow = useCallback(() => {
    const next = [...data, { s: `s${data.length + 1}`, pct: Math.max(0, (data[data.length - 1]?.pct ?? 10) - 5) }];
    setData(next);
    syncData(next);
  }, [data, syncData]);

  const removeAnalytics = useCallback(() => {
    if (!toNode) return;
    pushUndo();
    toNode.edgeRetention = undefined;
    updateActiveTree(getActive().tree);
    onClose();
  }, [toNode, pushUndo, updateActiveTree, getActive, onClose]);

  if (mode !== 'analytics' || !toNode) return null;

  const pw = 220;
  const x = Math.min(Math.max(sx - pw / 2, 156), window.innerWidth - pw - 8);
  const y = Math.max(Math.min(sy + 10, window.innerHeight - 300), 38);

  return ReactDOM.createPortal(
    <div id="edge-analytics" style={{ left: x, top: y }}>
      <div className="ea-header">
        <span>Analytics</span>
        <button className="ea-close" onClick={onClose}>×</button>
      </div>
      <div className="ea-body">
        {data.map((pt, i) => (
          <div key={i} className="ea-row">
            <input className="ret-inp ret-inp-lbl" value={pt.s} placeholder="label"
              onChange={e => updateRow(i, { s: e.target.value || pt.s })} />
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
      <div className="ea-footer">
        <button className="ret-reset ea-remove-btn" onClick={removeAnalytics}>× Remove analytics</button>
        <button className="ea-done-btn" onClick={onClose}>Done</button>
      </div>
    </div>,
    document.body,
  );
}
