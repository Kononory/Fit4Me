import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { TreeNode, EventEdge } from '../types';
import { decodeRef, fetchPreviewUrl } from '../lib/figma';

export const CARD_W   = 180;
export const TITLE_H  = 32;

interface Props {
  node: TreeNode;
  pos: { x: number; y: number };
  edges: EventEdge[];           // outgoing edges from this node
  allNodes: TreeNode[];
  onDragStart: (e: React.MouseEvent) => void;
  onHotspotClick: (bx: number, by: number, imgH: number) => void;
  onImgLoad: (h: number) => void;
  isPending: boolean;           // currently adding an edge from this card
}

export function EventCard({ node, pos, edges, allNodes, onDragStart, onHotspotClick, onImgLoad, isPending }: Props) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgH, setImgH] = useState(0);

  useEffect(() => {
    if (!node.figmaRef) return;
    const d = decodeRef(node.figmaRef);
    if (!d) return;
    fetchPreviewUrl(d.fileKey, d.nodeId).then(setImgUrl).catch(() => {});
  }, [node.figmaRef]);

  const handleImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const h = e.currentTarget.offsetHeight;
    setImgH(h);
    onImgLoad(h);
  };

  const handleImgClick = (e: React.MouseEvent<HTMLImageElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const bx = (e.clientX - rect.left) / rect.width;
    const by = (e.clientY - rect.top) / rect.height;
    onHotspotClick(bx, by, rect.height);
  };

  return (
    <div
      className={`evm-card${isPending ? ' evm-card-pending' : ''}`}
      style={{ left: pos.x, top: pos.y, width: CARD_W }}
    >
      {/* Drag handle — title bar */}
      <div className="evm-card-title" onMouseDown={onDragStart}>
        <span className="evm-card-label">{node.label}</span>
        {node.type && <span className="evm-card-type">{node.type}</span>}
      </div>

      {node.figmaRef ? (
        <div className="evm-card-img-wrap">
          {imgUrl ? (
            <>
              <img
                src={imgUrl}
                alt={node.label}
                className="evm-card-img"
                onClick={handleImgClick}
                onLoad={handleImgLoad}
                draggable={false}
              />
              {/* Hotspot dots */}
              {imgH > 0 && edges.map(edge => {
                const target = allNodes.find(n => n.id === edge.toNodeId);
                return (
                  <div
                    key={edge.id}
                    className="evm-hotspot"
                    style={{ left: edge.bx * CARD_W - 6, top: edge.by * imgH - 6 }}
                    title={`${edge.buttonLabel} → ${target?.label ?? '?'}`}
                  >
                    <span className="evm-hotspot-label">{edge.buttonLabel}</span>
                  </div>
                );
              })}
            </>
          ) : (
            <div className="evm-card-loading">
              <RefreshCw size={16} className="fig-spin" />
            </div>
          )}
        </div>
      ) : (
        <div className="evm-card-no-screen">No screen linked</div>
      )}
    </div>
  );
}
