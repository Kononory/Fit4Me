import { useEffect, useState, useRef } from 'react';
import { X, ArrowLeft, RefreshCw } from 'lucide-react';
import type { TreeNode, EventEdge } from '../types';
import { decodeRef, fetchPreviewUrl } from '../lib/figma';

interface Props {
  startNodeId: string;
  nodes: TreeNode[];
  eventEdges: EventEdge[];
  onClose: () => void;
}

export function PreviewPanel({ startNodeId, nodes, eventEdges, onClose }: Props) {
  const [currentId,    setCurrentId]    = useState(startNodeId);
  const [history,      setHistory]      = useState<string[]>([startNodeId]);
  const [imgUrl,       setImgUrl]       = useState<string | null>(null);
  const [fading,       setFading]       = useState(false);
  const [showHints,    setShowHints]    = useState(true);
  const imgRef = useRef<HTMLImageElement>(null);

  const currentNode  = nodes.find(n => n.id === currentId);
  const outgoing     = eventEdges.filter(e => e.fromNodeId === currentId);

  // Load image whenever screen changes
  useEffect(() => {
    setImgUrl(null);
    if (!currentNode?.figmaRef) return;
    const d = decodeRef(currentNode.figmaRef);
    if (!d) return;
    fetchPreviewUrl(d.fileKey, d.nodeId).then(setImgUrl).catch(() => {});
  }, [currentId, currentNode?.figmaRef]);

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const navigateTo = (nodeId: string) => {
    setFading(true);
    setTimeout(() => {
      setCurrentId(nodeId);
      setHistory(prev => [...prev, nodeId]);
      setFading(false);
    }, 180);
  };

  const goBack = () => {
    if (history.length <= 1) return;
    const prev = history[history.length - 2];
    setFading(true);
    setTimeout(() => {
      setCurrentId(prev);
      setHistory(h => h.slice(0, -1));
      setFading(false);
    }, 180);
  };

  // Breadcrumb from history
  const breadcrumb = history.map(id => nodes.find(n => n.id === id)?.label ?? id);

  return (
    <div id="pvw-backdrop" onClick={onClose}>
      <div id="pvw-panel" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div id="pvw-header">
          <div id="pvw-header-left">
            {history.length > 1 && (
              <button className="pvw-icon-btn" onClick={goBack} title="Back">
                <ArrowLeft size={14} />
              </button>
            )}
            <span id="pvw-screen-name">{currentNode?.label ?? '—'}</span>
          </div>
          <div id="pvw-header-right">
            <button
              className={`pvw-hints-btn${showHints ? ' pvw-hints-on' : ''}`}
              onClick={() => setShowHints(s => !s)}
              title="Toggle hotspot hints"
            >Hints</button>
            <button className="pvw-icon-btn" onClick={onClose} title="Close (Esc)">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Breadcrumb */}
        {breadcrumb.length > 1 && (
          <div id="pvw-breadcrumb">
            {breadcrumb.map((label, i) => (
              <span key={i} className={`pvw-crumb${i === breadcrumb.length - 1 ? ' pvw-crumb-cur' : ''}`}>
                {i > 0 && <span className="pvw-crumb-sep">›</span>}
                {label}
              </span>
            ))}
          </div>
        )}

        {/* Screen */}
        <div id="pvw-screen">
          {currentNode?.figmaRef ? (
            imgUrl ? (
              <div id="pvw-img-wrap" style={{ opacity: fading ? 0 : 1 }}>
                <img ref={imgRef} src={imgUrl} id="pvw-img" alt={currentNode.label} draggable={false} />
                {/* Hotspot overlays */}
                {outgoing.map(edge => {
                  const target = nodes.find(n => n.id === edge.toNodeId);
                  return (
                    <button
                      key={edge.id}
                      className={`pvw-hotspot${showHints ? ' pvw-hotspot-visible' : ''}`}
                      style={{ left: `${edge.bx * 100}%`, top: `${edge.by * 100}%` }}
                      onClick={() => navigateTo(edge.toNodeId)}
                      title={`${edge.buttonLabel} → ${target?.label ?? '?'}`}
                    />
                  );
                })}
              </div>
            ) : (
              <div id="pvw-loading">
                <RefreshCw size={22} className="fig-spin" />
              </div>
            )
          ) : (
            <div id="pvw-no-screen">
              <div id="pvw-no-screen-label">{currentNode?.label}</div>
              <p id="pvw-no-screen-hint">No Figma screen linked</p>
              {outgoing.length > 0 && (
                <div id="pvw-no-screen-events">
                  {outgoing.map(edge => {
                    const target = nodes.find(n => n.id === edge.toNodeId);
                    return (
                      <button key={edge.id} className="pvw-event-btn" onClick={() => navigateTo(edge.toNodeId)}>
                        {edge.buttonLabel} → {target?.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Event list — what can be tapped on this screen */}
        {outgoing.length > 0 && imgUrl && (
          <div id="pvw-footer">
            {outgoing.map(edge => {
              const target = nodes.find(n => n.id === edge.toNodeId);
              return (
                <button key={edge.id} className="pvw-footer-btn" onClick={() => navigateTo(edge.toNodeId)}>
                  <span className="pvw-footer-action">{edge.buttonLabel}</span>
                  <span className="pvw-footer-arrow">→</span>
                  <span className="pvw-footer-target">{target?.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
