import { useState, useEffect, useCallback } from 'react';
import { X, RefreshCw, GripVertical } from 'lucide-react';
import type { TreeNode, ScreenRef, CrossEdge } from '../types';
import { decodeRef, fetchPreviewUrl, getPAT } from '../lib/figma';
import { useStore } from '../store';

type ThumbState = { status: 'loading' } | { status: 'ok'; url: string } | { status: 'err' };

function ScreenCard({
  screen, index, isDragging, isDropTarget,
  onDragStart, onDragOver, onDragEnd, onDrop,
  onClick,
}: {
  screen: ScreenRef;
  index: number;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: (i: number) => void;
  onDragOver: (i: number) => void;
  onDragEnd: () => void;
  onDrop: (i: number) => void;
  onClick: () => void;
}) {
  const { setFigmaTokenOpen } = useStore();
  const [thumb, setThumb] = useState<ThumbState>({ status: 'loading' });

  useEffect(() => {
    const decoded = decodeRef(screen.ref);
    if (!decoded) { setThumb({ status: 'err' }); return; }
    if (!getPAT()) { setThumb({ status: 'err' }); return; }
    fetchPreviewUrl(decoded.fileKey, decoded.nodeId)
      .then(url => setThumb({ status: 'ok', url }))
      .catch(() => setThumb({ status: 'err' }));
  }, [screen.ref]);

  return (
    <div
      className={`uf-card ${isDragging ? 'uf-card-dragging' : ''} ${isDropTarget ? 'uf-card-drop' : ''}`}
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={e => { e.preventDefault(); onDragOver(index); }}
      onDragEnd={onDragEnd}
      onDrop={e => { e.preventDefault(); onDrop(index); }}
    >
      <div className="uf-card-drag" title="Drag to reorder">
        <GripVertical size={12} />
      </div>
      <div className="uf-card-thumb" onClick={onClick}>
        {thumb.status === 'loading' && <div className="uf-card-center"><RefreshCw size={14} className="fig-spin" /></div>}
        {thumb.status === 'err' && (
          <div className="uf-card-center">
            <button className="fig-action-btn" style={{ fontSize: 8 }} onClick={() => setFigmaTokenOpen(true)}>
              Set token
            </button>
          </div>
        )}
        {thumb.status === 'ok' && <img className="uf-card-img" src={thumb.url} alt={screen.name} />}
      </div>
      <div className="uf-card-label">{screen.name}</div>
    </div>
  );
}

interface Props {
  node: TreeNode;
  allNodes: TreeNode[];
  crossEdges: CrossEdge[];
  onReorder: (screens: ScreenRef[]) => void;
  onClose: () => void;
}

export function UserFlowView({ node, allNodes, crossEdges, onReorder, onClose }: Props) {
  const [screens, setScreens] = useState<ScreenRef[]>(node.screens ?? []);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const [fullScreen, setFullScreen] = useState<ScreenRef | null>(null);
  const [fullUrl, setFullUrl] = useState<string | null>(null);

  // Outgoing navigation: tree children + cross-edge targets
  const childNodes = node.c ?? [];
  const crossTargets = crossEdges
    .filter(ce => ce.fromId === node.id)
    .map(ce => allNodes.find(n => n.id === ce.toId))
    .filter((n): n is TreeNode => !!n);
  const outgoing = [
    ...childNodes,
    ...crossTargets.filter(t => !childNodes.some(c => c.id === t.id)),
  ];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (fullScreen) { setFullScreen(null); setFullUrl(null); }
        else onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, fullScreen]);

  const handleDragStart = useCallback((i: number) => setDragIdx(i), []);
  const handleDragOver = useCallback((i: number) => setDropIdx(i), []);
  const handleDragEnd = useCallback(() => { setDragIdx(null); setDropIdx(null); }, []);

  const handleDrop = useCallback((targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) return;
    const next = [...screens];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(targetIdx, 0, moved);
    // Reassign order values
    const reordered = next.map((s, i) => ({ ...s, order: i + 1 }));
    setScreens(reordered);
    onReorder(reordered);
    setDragIdx(null);
    setDropIdx(null);
  }, [dragIdx, screens, onReorder]);

  const openFullScreen = useCallback((screen: ScreenRef) => {
    setFullScreen(screen);
    setFullUrl(null);
    const decoded = decodeRef(screen.ref);
    if (!decoded || !getPAT()) return;
    fetchPreviewUrl(decoded.fileKey, decoded.nodeId)
      .then(url => setFullUrl(url))
      .catch(() => {});
  }, []);

  return (
    <div id="uf-backdrop" onClick={onClose}>
      <div id="uf-panel" onClick={e => e.stopPropagation()}>
        <div id="uf-header">
          <span id="uf-title">{node.label}</span>
          <span id="uf-count">{screens.length} screen{screens.length !== 1 ? 's' : ''}</span>
          <button id="uf-close" onClick={onClose}><X size={14} /></button>
        </div>

        <div id="uf-body">
          <div id="uf-flow">
            {screens.map((s, i) => (
              <div key={s.ref} className="uf-card-wrap">
                <ScreenCard
                  screen={s}
                  index={i}
                  isDragging={dragIdx === i}
                  isDropTarget={dropIdx === i && dragIdx !== i}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                  onDrop={handleDrop}
                  onClick={() => openFullScreen(s)}
                />
                {i < screens.length - 1 && <div className="uf-arrow">→</div>}
              </div>
            ))}

            {outgoing.length > 0 && (
              <div className="uf-outgoing">
                {screens.length > 0 && <div className="uf-arrow uf-arrow-out">→</div>}
                <div className="uf-outgoing-nodes">
                  {outgoing.map(n => (
                    <div key={n.id} className="uf-next-node">
                      {n.label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {screens.length === 0 && (
              <div className="uf-empty">No screens attached. Import from Figma to add screens.</div>
            )}
          </div>
        </div>
      </div>

      {/* Full-size screen preview overlay */}
      {fullScreen && (
        <div id="uf-fullscreen" onClick={() => { setFullScreen(null); setFullUrl(null); }}>
          <div id="uf-fullscreen-panel" onClick={e => e.stopPropagation()}>
            <div id="uf-fullscreen-header">
              <span>{fullScreen.name}</span>
              <button className="sc-icon-btn" onClick={() => { setFullScreen(null); setFullUrl(null); }}>
                <X size={13} />
              </button>
            </div>
            <div id="uf-fullscreen-body">
              {!fullUrl && <div className="uf-card-center"><RefreshCw size={18} className="fig-spin" /></div>}
              {fullUrl && <img id="uf-fullscreen-img" src={fullUrl} alt={fullScreen.name} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
