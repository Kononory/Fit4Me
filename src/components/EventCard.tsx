import { useEffect, useState, useRef } from 'react';
import { RefreshCw, Play } from 'lucide-react';
import type { TreeNode, EventEdge } from '../types';
import { decodeRef, fetchPreviewUrl, fetchFrameElements, hitTest } from '../lib/figma';
import type { FigmaElement, FrameData } from '../lib/figma';

export const CARD_W  = 180;
export const TITLE_H = 32;

interface Props {
  node: TreeNode;
  pos: { x: number; y: number };
  edges: EventEdge[];
  allNodes: TreeNode[];
  onDragStart: (e: React.MouseEvent) => void;
  onHotspotClick: (bx: number, by: number, imgH: number, elementName?: string) => void;
  onImgLoad: (h: number) => void;
  isPending: boolean;
  onPreview: () => void;
}

export function EventCard({ node, pos, edges, allNodes, onDragStart, onHotspotClick, onImgLoad, isPending, onPreview }: Props) {
  const [imgUrl,   setImgUrl]   = useState<string | null>(null);
  const [imgH,     setImgH]     = useState(0);
  const [frame,    setFrame]    = useState<FrameData | null>(null);
  const [hovered,  setHovered]  = useState<FigmaElement | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!node.figmaRef) return;
    const d = decodeRef(node.figmaRef);
    if (!d) return;
    fetchPreviewUrl(d.fileKey, d.nodeId).then(setImgUrl).catch(() => {});
    fetchFrameElements(d.fileKey, d.nodeId).then(setFrame).catch(() => {});
  }, [node.figmaRef]);

  const handleImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const h = e.currentTarget.offsetHeight;
    setImgH(h);
    onImgLoad(h);
  };

  // Convert image-local px to frame-local coords, then hit-test
  const toFrameCoords = (imgX: number, imgY: number) => {
    if (!frame || !imgRef.current) return null;
    const { width, height } = imgRef.current.getBoundingClientRect();
    return {
      fx: (imgX / width)  * frame.frameW,
      fy: (imgY / height) * frame.frameH,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!frame) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const c = toFrameCoords(e.clientX - rect.left, e.clientY - rect.top);
    if (!c) return;
    setHovered(hitTest(frame.elements, c.fx, c.fy));
  };

  const handleMouseLeave = () => setHovered(null);

  const handleImgClick = (e: React.MouseEvent<HTMLImageElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;
    const bx = relX / rect.width;
    const by = relY / rect.height;

    let elementName: string | undefined;
    if (frame) {
      const c = toFrameCoords(relX, relY);
      if (c) elementName = hitTest(frame.elements, c.fx, c.fy)?.name;
    }
    onHotspotClick(bx, by, rect.height, elementName);
  };

  // Scale a frame-local bounding box to image-local pixels
  const scaleBox = (el: FigmaElement) => {
    if (!frame || !imgRef.current) return null;
    const { width, height } = imgRef.current.getBoundingClientRect();
    return {
      left:   (el.x / frame.frameW) * width,
      top:    (el.y / frame.frameH) * height,
      width:  (el.w / frame.frameW) * width,
      height: (el.h / frame.frameH) * height,
    };
  };

  return (
    <div
      className={`evm-card${isPending ? ' evm-card-pending' : ''}`}
      style={{ left: pos.x, top: pos.y, width: CARD_W }}
    >
      <div className="evm-card-title" onMouseDown={onDragStart}>
        <span className="evm-card-label">{node.label}</span>
        <button className="evm-card-play" title="Preview from here"
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onPreview(); }}>
          <Play size={9} />
        </button>
      </div>

      {node.figmaRef ? (
        <div className="evm-card-img-wrap">
          {imgUrl ? (
            <>
              <img
                ref={imgRef}
                src={imgUrl}
                alt={node.label}
                className="evm-card-img"
                onClick={handleImgClick}
                onLoad={handleImgLoad}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                draggable={false}
              />

              {/* Hover element highlight */}
              {hovered && (() => {
                const box = scaleBox(hovered);
                return box ? (
                  <div className="evm-el-highlight" style={box} title={hovered.name}>
                    <span className="evm-el-name">{hovered.name}</span>
                  </div>
                ) : null;
              })()}

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
            <div className="evm-card-loading"><RefreshCw size={16} className="fig-spin" /></div>
          )}
        </div>
      ) : (
        <div className="evm-card-no-screen">No screen linked</div>
      )}
    </div>
  );
}
