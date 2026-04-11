import { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, RefreshCw, Maximize2, Play, ExternalLink } from 'lucide-react';
import type { TreeNode, ScreenRef } from '../types';
import { decodeRef, fetchPreviewUrl, getPAT } from '../lib/figma';
import { useStore } from '../store';

const PANEL_W = 224;
const PANEL_H = 330;

function getPosition(rect: DOMRect): { left: number; top: number } {
  let left = rect.right + 8;
  const top = Math.max(8, Math.min(rect.top, window.innerHeight - PANEL_H - 8));
  if (left + PANEL_W > window.innerWidth - 8) left = rect.left - PANEL_W - 8;
  return { left: Math.max(8, left), top };
}

type LoadState = { status: 'loading' } | { status: 'ok'; url: string } | { status: 'err'; msg: string } | { status: 'no_pat' };

interface Props {
  node: TreeNode;
  nodeRect: DOMRect;
  hasEventEdges?: boolean;
  onPreview?: () => void;
  onOpenFlow: () => void;
  onClose: () => void;
}

export function ScreenCarousel({ node, nodeRect, onPreview, onOpenFlow, onClose }: Props) {
  const { setFigmaTokenOpen, figmaTokenOpen } = useStore();
  const screens = node.screens ?? [];
  const [idx, setIdx] = useState(0);
  const [ls, setLs] = useState<LoadState>({ status: 'loading' });
  const prevTokenOpen = { current: figmaTokenOpen };

  const screen: ScreenRef | undefined = screens[idx];
  const pos = getPosition(nodeRect);

  const loadThumb = useCallback(() => {
    if (!screen) return;
    if (!getPAT()) { setLs({ status: 'no_pat' }); return; }
    const decoded = decodeRef(screen.ref);
    if (!decoded) { setLs({ status: 'err', msg: 'Invalid ref' }); return; }
    setLs({ status: 'loading' });
    fetchPreviewUrl(decoded.fileKey, decoded.nodeId)
      .then(url => setLs({ status: 'ok', url }))
      .catch(e => {
        const msg = String((e as Error).message ?? e);
        setLs(msg === 'no_pat' ? { status: 'no_pat' } : { status: 'err', msg });
      });
  }, [screen]);

  useEffect(() => { loadThumb(); }, [loadThumb]);

  // Reload when token modal closes
  useEffect(() => {
    if (prevTokenOpen.current && !figmaTokenOpen && ls.status === 'no_pat') loadThumb();
    prevTokenOpen.current = figmaTokenOpen;
  });

  const prev = () => setIdx(i => (i - 1 + screens.length) % screens.length);
  const next = () => setIdx(i => (i + 1) % screens.length);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!screen) return null;

  return (
    <>
      <div className="sc-backdrop" onClick={onClose} />
      <div
        id="sc-carousel"
        style={{ left: pos.left, top: pos.top }}
        onClick={e => e.stopPropagation()}
      >
        <div className="sc-header">
          <span className="sc-title">{node.label}</span>
          <div className="sc-header-actions">
            {onPreview && (
              <button className="sc-icon-btn" title="Preview prototype flow" onClick={onPreview}>
                <Play size={11} />
              </button>
            )}
            {screen && (() => {
              const decoded = decodeRef(screen.ref);
              const figmaUrl = decoded
                ? `https://www.figma.com/design/${decoded.fileKey}?node-id=${encodeURIComponent(decoded.nodeId)}`
                : null;
              return figmaUrl ? (
                <a className="sc-icon-btn" href={figmaUrl} target="_blank" rel="noreferrer" title="Open in Figma">
                  <ExternalLink size={11} />
                </a>
              ) : null;
            })()}
            <button className="sc-icon-btn" title="View full flow" onClick={onOpenFlow}>
              <Maximize2 size={11} />
            </button>
            <button className="sc-icon-btn" onClick={onClose}><X size={11} /></button>
          </div>
        </div>

        <div className="sc-image-area">
          {ls.status === 'loading' && (
            <div className="sc-center"><RefreshCw size={16} className="fig-spin" /></div>
          )}
          {ls.status === 'no_pat' && (
            <div className="sc-center sc-hint">
              <p>No Figma token.</p>
              <button className="fig-action-btn" onClick={() => setFigmaTokenOpen(true)}>Set token</button>
            </div>
          )}
          {ls.status === 'err' && (
            <div className="sc-center sc-hint">
              <p>{ls.msg}</p>
              <button className="fig-action-btn" onClick={loadThumb}>Retry</button>
            </div>
          )}
          {ls.status === 'ok' && (
            <img className="sc-img" src={ls.url} alt={screen.name} />
          )}
        </div>

        <div className="sc-nav">
          <button className="sc-nav-btn" onClick={prev} disabled={screens.length <= 1}>
            <ChevronLeft size={14} />
          </button>
          <span className="sc-nav-label">{screen.name}</span>
          <span className="sc-nav-counter">{idx + 1}/{screens.length}</span>
          <button className="sc-nav-btn" onClick={next} disabled={screens.length <= 1}>
            <ChevronRight size={14} />
          </button>
        </div>

        <button className="sc-flow-btn" onClick={onOpenFlow}>
          View full flow →
        </button>
      </div>
    </>
  );
}
