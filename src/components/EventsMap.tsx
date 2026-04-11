import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Pencil, Check, Play } from 'lucide-react';
import { useStore } from '../store';
import { flattenTree } from '../layout';

const FF = 'LatteraMonoLL,Space Mono,monospace';
import type { EventEdge } from '../types';
import { EventCard, CARD_W, TITLE_H } from './EventCard';
import { PreviewPanel } from './PreviewPanel';

// Default card positions — arranged in a loose grid
function defaultPos(idx: number): { x: number; y: number } {
  const col = idx % 3;
  const row = Math.floor(idx / 3);
  return { x: 40 + col * (CARD_W + 80), y: 40 + row * 420 };
}

interface PendingHotspot {
  nodeId: string;
  bx: number;
  by: number;
  canvasX: number;
  canvasY: number;
}

interface EdgeForm {
  buttonLabel: string;
  eventName: string;
  toNodeId: string;
}

export function EventsMap() {
  const { getActive, flows, setFlows, evmZoom, setEvmZoom } = useStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const flow = getActive();
  const nodes = flattenTree(flow.tree);
  const eventEdges = flow.eventEdges ?? [];
  const eventPositions = flow.eventPositions ?? {};

  // ── Local card positions (mirror of flow.eventPositions + drag override) ──
  const [localPos, setLocalPos] = useState<Record<string, { x: number; y: number }>>({});
  // Sync when flow changes
  useEffect(() => {
    setLocalPos(eventPositions);
  }, [flow.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const getPos = useCallback((nodeId: string, idx: number) => {
    return localPos[nodeId] ?? eventPositions[nodeId] ?? defaultPos(idx);
  }, [localPos, eventPositions]);

  // ── Image heights per node (for edge coordinate calc) ────────────────────
  const [imgHeights, setImgHeights] = useState<Record<string, number>>({});

  // ── Drag ─────────────────────────────────────────────────────────────────
  const dragRef = useRef<{
    nodeId: string;
    startCardX: number; startCardY: number;
    startMouseX: number; startMouseY: number;
  } | null>(null);

  const handleDragStart = useCallback((nodeId: string, idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    const pos = getPos(nodeId, idx);
    dragRef.current = {
      nodeId,
      startCardX: pos.x, startCardY: pos.y,
      startMouseX: e.clientX, startMouseY: e.clientY,
    };
  }, [getPos]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const x = Math.max(0, d.startCardX + e.clientX - d.startMouseX);
      const y = Math.max(0, d.startCardY + e.clientY - d.startMouseY);
      setLocalPos(prev => ({ ...prev, [d.nodeId]: { x, y } }));
    };
    const onUp = () => {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      // Commit to store
      setLocalPos(prev => {
        const pos = prev[d.nodeId];
        if (pos) {
          const updated = flows.map(f => f.id === flow.id ? {
            ...f, eventPositions: { ...(f.eventPositions ?? {}), [d.nodeId]: pos }
          } : f);
          setFlows(updated);
        }
        return prev;
      });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [flows, flow.id, setFlows]);

  // ── Ctrl+Scroll zoom ─────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setEvmZoom(evmZoom + e.deltaY * -0.005);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [evmZoom, setEvmZoom]);

  // ── Hotspot / edge creation ───────────────────────────────────────────────
  const [pendingHotspot, setPendingHotspot] = useState<PendingHotspot | null>(null);
  const [edgeForm, setEdgeForm] = useState<EdgeForm>({ buttonLabel: '', eventName: 'tap', toNodeId: '' });
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EdgeForm>({ buttonLabel: '', eventName: '', toNodeId: '' });
  const [previewStartId, setPreviewStartId] = useState<string | null>(null);

  const handleHotspotClick = useCallback((nodeId: string, idx: number, bx: number, by: number, imgH: number, elementName?: string) => {
    const pos = getPos(nodeId, idx);
    const canvasX = pos.x + bx * CARD_W;
    const canvasY = pos.y + TITLE_H + by * imgH;
    const firstOther = nodes.find(n => n.id !== nodeId);
    setPendingHotspot({ nodeId, bx, by, canvasX, canvasY });
    setEdgeForm({ buttonLabel: elementName ?? '', eventName: 'tap', toNodeId: firstOther?.id ?? '' });
  }, [getPos, nodes]);

  const confirmEdge = useCallback(() => {
    if (!pendingHotspot || !edgeForm.buttonLabel.trim() || !edgeForm.toNodeId) return;
    const newEdge: EventEdge = {
      id: `ev-${Date.now()}`,
      fromNodeId: pendingHotspot.nodeId,
      toNodeId: edgeForm.toNodeId,
      buttonLabel: edgeForm.buttonLabel.trim(),
      eventName: edgeForm.eventName.trim() || 'tap',
      bx: pendingHotspot.bx,
      by: pendingHotspot.by,
    };
    const updated = flows.map(f => f.id === flow.id
      ? { ...f, eventEdges: [...(f.eventEdges ?? []), newEdge] }
      : f);
    setFlows(updated);
    setPendingHotspot(null);
  }, [pendingHotspot, edgeForm, flows, flow.id, setFlows]);

  const removeEdge = useCallback((edgeId: string) => {
    const updated = flows.map(f => f.id === flow.id
      ? { ...f, eventEdges: (f.eventEdges ?? []).filter(e => e.id !== edgeId) }
      : f);
    setFlows(updated);
  }, [flows, flow.id, setFlows]);

  // ── Canvas size ───────────────────────────────────────────────────────────
  const canvasW = Math.max(800, ...nodes.map((n, i) => getPos(n.id, i).x + CARD_W + 80));
  const canvasH = Math.max(600, ...nodes.map((n, i) => {
    const ih = imgHeights[n.id] ?? 300;
    return getPos(n.id, i).y + TITLE_H + ih + 60;
  }));

  return (
    <div id="evm-container" ref={containerRef}>
      <div id="evm-canvas" style={{ width: canvasW, height: canvasH, zoom: evmZoom }}>

        {/* SVG edge layer */}
        <svg
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}
          width={canvasW} height={canvasH}
        >
          <defs>
            <marker id="evm-arr" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="#ABABAA" />
            </marker>
          </defs>
          {eventEdges.map(edge => {
            const fi = nodes.findIndex(n => n.id === edge.fromNodeId);
            const ti = nodes.findIndex(n => n.id === edge.toNodeId);
            if (fi < 0 || ti < 0) return null;
            const fromPos = getPos(edge.fromNodeId, fi);
            const toPos   = getPos(edge.toNodeId, ti);
            const fromIH  = imgHeights[edge.fromNodeId] ?? 300;
            const toIH    = imgHeights[edge.toNodeId]   ?? 300;

            const x1 = fromPos.x + edge.bx * CARD_W;
            const y1 = fromPos.y + TITLE_H + edge.by * fromIH;
            const x2 = toPos.x + CARD_W / 2;
            const y2 = toPos.y + TITLE_H + toIH / 2;
            const R  = Math.max(80, Math.abs(x1 - x2) * 0.35 + 60);
            const d  = `M${x1} ${y1} C${x1 + R} ${y1} ${x2 + R} ${y2} ${x2} ${y2}`;

            const lx = (x1 + x1 + R + x2 + R + x2) / 4;
            const ly = (y1 + y2) / 2;
            const color = '#ABABAA';
            const labelStr = edge.buttonLabel;
            const eventStr = edge.eventName !== 'tap' ? edge.eventName : null;
            const tw = labelStr.length * 6 + 12;

            return (
              <g key={edge.id}>
                <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="3 4"
                  markerEnd="url(#evm-arr)" pointerEvents="none" />
                <rect x={lx - tw / 2} y={ly - 9} width={tw} height={14} rx={3}
                  fill="#FEFCF8" stroke={color} strokeWidth={1} pointerEvents="none" />
                <text x={lx} y={ly + 4} textAnchor="middle" fill={color}
                  fontSize={9} fontFamily={FF} pointerEvents="none">{labelStr}</text>
                {eventStr && (
                  <text x={lx} y={ly + 18} textAnchor="middle" fill="#BCBBB7"
                    fontSize={8} fontFamily={FF} pointerEvents="none">{eventStr}</text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Cards */}
        {nodes.map((n, i) => (
          <EventCard
            key={n.id}
            node={n}
            pos={getPos(n.id, i)}
            edges={eventEdges.filter(e => e.fromNodeId === n.id)}
            allNodes={nodes}
            onDragStart={e => handleDragStart(n.id, i, e)}
            onHotspotClick={(bx, by, imgH, name) => handleHotspotClick(n.id, i, bx, by, imgH, name)}
            onPreview={() => setPreviewStartId(n.id)}
            onImgLoad={h => setImgHeights(prev => ({ ...prev, [n.id]: h }))}
            isPending={pendingHotspot?.nodeId === n.id}
          />
        ))}

        {/* Edge creation popover */}
        {pendingHotspot && (
          <div
            className="evm-popover"
            style={{ left: pendingHotspot.canvasX + 12, top: pendingHotspot.canvasY - 12 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="evm-popover-header">
              <span className="evm-popover-title">Add event</span>
              <button className="fig-preview-icon-btn" onClick={() => setPendingHotspot(null)}><X size={12} /></button>
            </div>
            <input
              className="evm-popover-input"
              autoFocus
              placeholder="Button label"
              value={edgeForm.buttonLabel}
              onChange={e => setEdgeForm(f => ({ ...f, buttonLabel: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') confirmEdge(); if (e.key === 'Escape') setPendingHotspot(null); }}
            />
            <input
              className="evm-popover-input"
              placeholder="Event (tap)"
              value={edgeForm.eventName}
              onChange={e => setEdgeForm(f => ({ ...f, eventName: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') confirmEdge(); if (e.key === 'Escape') setPendingHotspot(null); }}
            />
            <div className="evm-popover-label">Target screen</div>
            <div className="evm-popover-targets">
              {nodes.filter(n => n.id !== pendingHotspot.nodeId).map(n => (
                <button
                  key={n.id}
                  className={`evm-target-btn${edgeForm.toNodeId === n.id ? ' evm-target-btn-active' : ''}`}
                  onClick={() => setEdgeForm(f => ({ ...f, toNodeId: n.id }))}
                >{n.label}</button>
              ))}
            </div>
            <button className="evm-confirm-btn" onClick={confirmEdge}
              disabled={!edgeForm.buttonLabel.trim() || !edgeForm.toNodeId}>
              Add
            </button>
          </div>
        )}
      </div>

      {/* Preview panel */}
      {previewStartId && (
        <PreviewPanel
          startNodeId={previewStartId}
          nodes={nodes}
          eventEdges={eventEdges}
          onClose={() => setPreviewStartId(null)}
        />
      )}

      {/* Events sidebar */}
      {eventEdges.length > 0 && (
        <div id="evm-edge-list">
          <div id="evm-edge-list-header">
            <div className="evm-edge-list-title">Events</div>
            <button id="evm-preview-btn"
              title="Preview prototype"
              onClick={() => {
                const first = nodes.find(n => n.screens?.length) ?? nodes[0];
                if (first) setPreviewStartId(first.id);
              }}
            ><Play size={10} /> Preview</button>
          </div>
          {eventEdges.map(edge => {
            const from = nodes.find(n => n.id === edge.fromNodeId);
            const to   = nodes.find(n => n.id === edge.toNodeId);
            const isEditing = editingEdgeId === edge.id;

            if (isEditing) {
              return (
                <div key={edge.id} className="evm-edge-row evm-edge-row-edit">
                  <input className="evm-edit-input" value={editForm.buttonLabel}
                    placeholder="Button label"
                    onChange={e => setEditForm(f => ({ ...f, buttonLabel: e.target.value }))} />
                  <input className="evm-edit-input" value={editForm.eventName}
                    placeholder="Event (tap)"
                    onChange={e => setEditForm(f => ({ ...f, eventName: e.target.value }))} />
                  <select className="evm-edit-select" value={editForm.toNodeId}
                    onChange={e => setEditForm(f => ({ ...f, toNodeId: e.target.value }))}>
                    {nodes.filter(n => n.id !== edge.fromNodeId).map(n => (
                      <option key={n.id} value={n.id}>{n.label}</option>
                    ))}
                  </select>
                  <div className="evm-edit-actions">
                    <button className="evm-edge-del" title="Save" onClick={() => {
                      const updated = flows.map(f => f.id === flow.id ? {
                        ...f, eventEdges: (f.eventEdges ?? []).map(e =>
                          e.id === edge.id ? { ...e, ...editForm, eventName: editForm.eventName || 'tap' } : e
                        )
                      } : f);
                      setFlows(updated);
                      setEditingEdgeId(null);
                    }}><Check size={10} /></button>
                    <button className="evm-edge-del" title="Cancel" onClick={() => setEditingEdgeId(null)}><X size={10} /></button>
                  </div>
                </div>
              );
            }

            return (
              <div key={edge.id} className="evm-edge-row">
                <span className="evm-edge-info">
                  <span className="evm-edge-from">{from?.label}</span>
                  {' '}<span className="evm-edge-btn-label">"{edge.buttonLabel}"</span>
                  {' '}→{' '}<span className="evm-edge-from">{to?.label}</span>
                  <span className="evm-edge-event"> · {edge.eventName}</span>
                </span>
                <div className="evm-edge-actions">
                  <button className="evm-edge-del" title="Edit" onClick={() => {
                    setEditingEdgeId(edge.id);
                    setEditForm({ buttonLabel: edge.buttonLabel, eventName: edge.eventName, toNodeId: edge.toNodeId });
                  }}><Pencil size={10} /></button>
                  <button className="evm-edge-del" title="Delete" onClick={() => removeEdge(edge.id)}><X size={10} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
