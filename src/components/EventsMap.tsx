import { useState, useRef, useCallback, useEffect } from 'react';
import { X } from 'lucide-react';
import { useStore } from '../store';
import { flattenTree } from '../layout';
import type { EventEdge, TreeNode } from '../types';
import { EventCard, CARD_W, TITLE_H } from './EventCard';

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
  const { getActive, flows, setFlows } = useStore();
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

  // ── Hotspot / edge creation ───────────────────────────────────────────────
  const [pendingHotspot, setPendingHotspot] = useState<PendingHotspot | null>(null);
  const [edgeForm, setEdgeForm] = useState<EdgeForm>({ buttonLabel: '', eventName: 'tap', toNodeId: '' });

  const handleHotspotClick = useCallback((nodeId: string, idx: number, bx: number, by: number, imgH: number) => {
    const pos = getPos(nodeId, idx);
    const canvasX = pos.x + bx * CARD_W;
    const canvasY = pos.y + TITLE_H + by * imgH;
    // Pre-select first other node as target
    const firstOther = nodes.find(n => n.id !== nodeId);
    setPendingHotspot({ nodeId, bx, by, canvasX, canvasY });
    setEdgeForm({ buttonLabel: '', eventName: 'tap', toNodeId: firstOther?.id ?? '' });
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
    <div id="evm-container">
      <div id="evm-canvas" style={{ width: canvasW, height: canvasH }}>

        {/* SVG edge layer */}
        <svg
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}
          width={canvasW} height={canvasH}
        >
          <defs>
            <marker id="evm-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <polygon points="0 0, 7 3.5, 0 7" fill="#1A1A1A" />
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

            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;

            return (
              <g key={edge.id}>
                <path
                  d={`M ${x1} ${y1} C ${x1 + 60} ${y1} ${x2 - 60} ${y2} ${x2} ${y2}`}
                  stroke="#1A1A1A" strokeWidth={1.5} fill="none"
                  markerEnd="url(#evm-arrow)"
                />
                <text x={mx} y={my - 7} textAnchor="middle"
                  fontSize={9} fill="#1A1A1A"
                  fontFamily="'LatteraMonoLL','Space Mono',monospace"
                  fontWeight="700"
                >{edge.buttonLabel}</text>
                <text x={mx} y={my + 4} textAnchor="middle"
                  fontSize={8} fill="#9A9995"
                  fontFamily="'LatteraMonoLL','Space Mono',monospace"
                >{edge.eventName}</text>
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
            onHotspotClick={(bx, by, imgH) => handleHotspotClick(n.id, i, bx, by, imgH)}
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

      {/* Edge delete buttons (fixed overlay) */}
      {eventEdges.length > 0 && (
        <div id="evm-edge-list">
          <div className="evm-edge-list-title">Events</div>
          {eventEdges.map(edge => {
            const from = nodes.find(n => n.id === edge.fromNodeId);
            const to   = nodes.find(n => n.id === edge.toNodeId);
            return (
              <div key={edge.id} className="evm-edge-row">
                <span className="evm-edge-info">
                  {from?.label} <span className="evm-edge-btn-label">"{edge.buttonLabel}"</span> → {to?.label}
                </span>
                <button className="evm-edge-del" onClick={() => removeEdge(edge.id)}><X size={10} /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
