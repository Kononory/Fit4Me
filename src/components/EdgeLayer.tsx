import { useCallback, useRef } from 'react';
import type { TreeNode, CrossEdge, RetentionPoint, SelectionState } from '../types';
import { NW, centerY } from '../layout';
import { buildChart } from '../retention';
const EDGE_STATUS = {
  up:   { icon: '▲', color: '#6B9B5E', bg: '#EEF5EA', border: '#A4C89A' },
  down: { icon: '▽', color: '#B52B1E', bg: '#FCECEA', border: '#D98A83' },
  ok:   { icon: '●', color: '#6B9B5E', bg: '#EEF5EA', border: '#A4C89A' },
  warn: { icon: '■', color: '#C8963C', bg: '#FDF4E7', border: '#DEB87A' },
} as const;

const BADGE_SZ = 14, BADGE_GAP = 4, BADGE_PAD = 5;

function analyticsLabel(pts: RetentionPoint[]): { dir: 'up' | 'down' | 'flat'; label: string } {
  if (pts.length < 2) return { dir: 'flat', label: `${Math.round(pts[0]?.pct ?? 0)}%` };
  const delta = pts[pts.length - 1].pct - pts[0].pct;
  const abs = Math.round(Math.abs(delta));
  if (delta > 0.5)  return { dir: 'up',   label: `+${abs}%` };
  if (delta < -0.5) return { dir: 'down', label: `\u2212${abs}%` };
  return { dir: 'flat', label: `${Math.round(pts[0].pct)}%` };
}
const FF = 'LatteraMonoLL,Space Mono,monospace';

interface Props {
  allNodes: TreeNode[];
  allEdges: [TreeNode, TreeNode][];
  crossEdges: CrossEdge[];
  width: number;
  height: number;
  doAnim: boolean;
  sel: string | null;
  selNodeId: string | null;
  selTick: number;
  cnvRef: React.RefObject<HTMLDivElement | null>;
  onShowEdgePicker: (toNode: TreeNode, lx: number, ly: number) => void;
  onShowCrossEdgePicker: (ce: CrossEdge, lx: number, ly: number) => void;
}

function edgeState(from: TreeNode, to: TreeNode, sel: string | null, selNodeId: string | null): SelectionState {
  const ns = (n: TreeNode): SelectionState => {
    if (!sel) return 'def';
    if (n.id === selNodeId) return 'act';
    if (!n.b) return 'par';
    return n.b === sel ? 'def' : 'dim';
  };
  if (!sel) return 'par';
  const fs = ns(from), ts = ns(to);
  if (fs === 'act' || ts === 'act') return 'act';
  if (fs === 'dim' || ts === 'dim') return 'dim';
  return 'par';
}

function findChain(allNodes: TreeNode[], allEdges: [TreeNode, TreeNode][], toId: string): RetentionPoint[][] {
  const parentOf = new Map(allEdges.map(([f, t]) => [t.id, f.id]));
  const nodeById = new Map(allNodes.map(n => [n.id, n]));
  const chain: RetentionPoint[][] = [];
  let id: string | undefined = toId;
  while (id) {
    const node = nodeById.get(id);
    if (node?.edgeRetention) chain.unshift(node.edgeRetention);
    id = parentOf.get(id);
  }
  return chain;
}

function buildChainData(segments: RetentionPoint[][]): { combined: RetentionPoint[]; highlightFrom: number } {
  if (segments.length <= 1) return { combined: segments[0] ?? [], highlightFrom: 0 };
  let scale = 1.0;
  const combined: RetentionPoint[] = [];
  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];
    const skip = si > 0 ? 1 : 0; // skip first point of later segments — it equals prior segment's last
    for (let pi = skip; pi < seg.length; pi++) {
      combined.push({ s: seg[pi].s, pct: Math.round(seg[pi].pct * scale * 10) / 10 });
    }
    if (si < segments.length - 1) scale *= seg[seg.length - 1].pct / (seg[0].pct || 1);
  }
  // highlightFrom = total points from all prior segments (minus skipped overlaps)
  let hf = segments[0].length;
  for (let si = 1; si < segments.length - 1; si++) hf += segments[si].length - 1;
  return { combined, highlightFrom: hf };
}

function canvasToScreen(lx: number, ly: number, cnvRef: React.RefObject<HTMLDivElement | null>) {
  const r = cnvRef.current?.getBoundingClientRect();
  return { x: (r?.left ?? 0) + lx, y: (r?.top ?? 0) + ly };
}

export function EdgeLayer({ allNodes, allEdges, crossEdges, width, height, doAnim, sel, selNodeId, cnvRef, onShowEdgePicker, onShowCrossEdgePicker }: Props) {
  const chartTimerRef = useRef<Record<string, number>>({});

  const showChartPreview = useCallback((
    aData: RetentionPoint[], bx: number, ly: number,
    toNode: TreeNode, nodes: TreeNode[], edges: [TreeNode, TreeNode][],
  ) => {
    document.getElementById('edge-chart-preview')?.remove();
    const { x: sx, y: sy } = canvasToScreen(bx, ly, cnvRef);
    const chain = findChain(nodes, edges, toNode.id);
    const { combined, highlightFrom } = buildChainData(chain);
    const chartData = combined.length > 0 ? combined : aData;
    const pop = document.createElement('div');
    pop.id = 'edge-chart-preview';
    pop.style.cssText = `position:fixed;z-index:95;background:#1A1916;border:1px solid #2E2D2A;border-radius:6px;padding:10px;pointer-events:none;`;
    pop.appendChild(buildChart(chartData, highlightFrom));
    if (chartData.length >= 2) {
      const s = document.createElement('div');
      s.style.cssText = 'font-size:10px;color:#AEADA8;margin-top:4px;text-align:center;font-family:monospace;';
      s.textContent = `${chartData[chartData.length - 1].pct}% reach the final stage`;
      pop.appendChild(s);
    }
    document.body.appendChild(pop);
    const pw = 268, ph = pop.offsetHeight || 170;
    let px = sx - pw / 2, py = sy - ph - 10;
    px = Math.max(6, Math.min(px, window.innerWidth - pw - 6));
    py = py < 6 ? sy + 20 : py;
    pop.style.left = px + 'px'; pop.style.top = py + 'px';
  }, [cnvRef]); // allNodes/allEdges passed as params at call time — no dep needed

  const hideChartPreview = useCallback((key: string) => {
    chartTimerRef.current[key] = window.setTimeout(() => {
      document.getElementById('edge-chart-preview')?.remove();
    }, 120);
  }, []);

  // Beam: selected node + entire subtree downstream
  const beamSourceIds = new Set<string>();
  if (selNodeId) {
    const collect = (n: TreeNode) => { beamSourceIds.add(n.id); for (const c of n.c ?? []) collect(c); };
    const selNode = allNodes.find(n => n.id === selNodeId);
    if (selNode) collect(selNode);
  }

  // Pre-compute edge geometry (needed for both defs and path rendering)
  const edgeGeom = allEdges.map(([f, t]) => {
    const x1 = f.x! + NW, y1 = centerY(f), x2 = t.x!, y2 = centerY(t), mx = (x1 + x2) / 2;
    return { x1, y1, x2, y2, mx };
  });

  const viewBox = `0 0 ${width} ${height}`;

  return (
    <svg id="svgl" width={width} height={height} viewBox={viewBox} style={{ position: 'absolute', top: 0, left: 0 }}>
      <defs>
        <marker id="arr-back" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#C8963C" />
        </marker>
        <marker id="arr-ref" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#ABABAA" />
        </marker>
        {/* Static amber gradient — objectBoundingBox scales to each path's own bounds */}
        <linearGradient id="beam-grad" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"    stopColor="#ffaa40" stopOpacity="0" />
          <stop offset="5%"    stopColor="#ffaa40" stopOpacity="1" />
          <stop offset="95%"   stopColor="#ffaa40" stopOpacity="1" />
          <stop offset="100%"  stopColor="#ffaa40" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Tree edges */}
      {allEdges.map(([f, t], ei) => {
        const { x1, y1, x2, y2, mx } = edgeGeom[ei];
        const lx = mx, ly = (y1 + y2) / 2;
        const es = edgeState(f, t, sel, selNodeId);
        const stroke = es === 'act' ? '#1A1A1A' : es === 'dim' ? '#E0DFD9' : '#ABABAA';
        const sw = es === 'act' ? 1.5 : 1;
        const d = `M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;

        // Badge layout
        const labelW = t.edgeLabel ? Math.max(t.edgeLabel.length * 6 + 10, 24) : 0;
        // Pre-compute status pill width (wider when analytics add a label)
        const hasStatusBadge = !!(t.edgeStatus || t.edgeRetention);
        let statusPillW = BADGE_SZ;
        let statusCfg = t.edgeStatus ? EDGE_STATUS[t.edgeStatus] : null;
        let extraLabel: string | null = null;
        if (t.edgeRetention) {
          const { dir, label } = analyticsLabel(t.edgeRetention);
          extraLabel = label;
          if (!statusCfg) statusCfg = dir === 'up' ? EDGE_STATUS.up : dir === 'down' ? EDGE_STATUS.down : EDGE_STATUS.ok;
          statusPillW = Math.max(BADGE_SZ, (statusCfg.icon.length * 7) + (extraLabel.length * 6) + BADGE_PAD * 2);
        }
        const bWidths = [
          ...(t.edgeLabel     ? [labelW]      : []),
          ...(hasStatusBadge  ? [statusPillW] : []),
          ...(t.edgeRetention ? [BADGE_SZ]    : []),
        ];
        const totalBW = bWidths.reduce((s, w) => s + w, 0) + BADGE_GAP * Math.max(0, bWidths.length - 1);
        let bCursor = lx - totalBW / 2;
        const grabBX = (w: number) => { const cx = bCursor + w / 2; bCursor += w + BADGE_GAP; return cx; };
        const hasAnnotation = !!(t.edgeLabel || t.edgeStatus || t.edgeRetention);

        // Trim-path draw animation on mount.
        // pathLength="1" normalises the path so dasharray/dashoffset of 1 = full length.
        const pathStyle: React.CSSProperties = doAnim ? {
          strokeDasharray: 1,
          strokeDashoffset: 1,
          animation: `edge-draw 0.35s ease-out ${ei * 0.025}s forwards`,
        } : {};


        return (
          <g key={`${f.id}-${t.id}`}>
            {/* Base path — pathLength="1" makes dashoffset work without getTotalLength() */}
            <path d={d} pathLength={doAnim ? 1 : undefined} fill="none" stroke={stroke} strokeWidth={sw} pointerEvents="none" style={pathStyle} />

            {/*
              Beam overlay — CSS animation so timing is always relative to element mount,
              never the SVG document timeline (which breaks SMIL on dynamic elements).
              key={selTick} forces remount on every selection → animation always restarts.
              pathLength="1" + dasharray/dashoffset sweeps a segment across the full path.
            */}
            {/* beam disabled
            {beamActive && (
              <path
                key={selTick}
                d={d}
                pathLength={1}
                fill="none"
                stroke="url(#beam-grad)"
                strokeWidth={sw + 2}
                strokeLinecap="round"
                strokeDasharray="0.15 0.85"
                strokeDashoffset={1.15}
                pointerEvents="none"
                style={{ animation: `beam-sweep 0.7s ease-out ${delay} forwards` }}
              />
            )} */}

            {/* Hit area */}
            <path d={d} fill="none" stroke="rgba(0,0,0,0)" strokeWidth={14} pointerEvents="stroke"
              style={{ cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); onShowEdgePicker(t, lx, ly); }}
              onMouseEnter={hasAnnotation ? undefined : e => {
                const g = (e.currentTarget as SVGElement).parentElement;
                g?.querySelector('.edge-hint-sq')?.setAttribute('opacity', '1');
                g?.querySelector('.edge-hint-tx')?.setAttribute('opacity', '1');
              }}
              onMouseLeave={hasAnnotation ? undefined : e => {
                const g = (e.currentTarget as SVGElement).parentElement;
                g?.querySelector('.edge-hint-sq')?.setAttribute('opacity', '0');
                g?.querySelector('.edge-hint-tx')?.setAttribute('opacity', '0');
              }}
            />

            {/* Label pill */}
            {t.edgeLabel && (() => { const bx = grabBX(labelW); return (<>
              <rect x={bx - labelW / 2} y={ly - 7} width={labelW} height={13} rx={3}
                fill="#FEFCF8" stroke="#BCBBB7" strokeWidth={0.8} pointerEvents="none" />
              <text x={bx} y={ly + 4} textAnchor="middle" fill="#5A5955" fontSize={10} fontFamily={FF} pointerEvents="none">{t.edgeLabel}</text>
            </>); })()}

            {/* Status badge (+ auto-labeled from analytics when present) */}
            {hasStatusBadge && (() => {
              const bx = grabBX(statusPillW);
              const fullText = extraLabel ? `${statusCfg!.icon} ${extraLabel}` : statusCfg!.icon;
              return (<>
                <rect x={bx - statusPillW / 2} y={ly - BADGE_SZ / 2} width={statusPillW} height={BADGE_SZ} rx={3}
                  fill={statusCfg!.bg} stroke={statusCfg!.border} strokeWidth={1} pointerEvents="none" />
                <text x={bx} y={ly + 4} textAnchor="middle" fill={statusCfg!.color} fontSize={8} fontFamily={FF} pointerEvents="none">{fullText}</text>
              </>);
            })()}

            {/* Analytics badge */}
            {t.edgeRetention && (() => {
              const bx = grabBX(BADGE_SZ);
              const aData = t.edgeRetention!;
              const key = `${f.id}-${t.id}`;
              return (<>
                <rect x={bx - BADGE_SZ / 2} y={ly - BADGE_SZ / 2} width={BADGE_SZ} height={BADGE_SZ} rx={2}
                  fill="#F0EDFF" stroke="#9B8FD4" strokeWidth={1} pointerEvents="visiblePainted" style={{ cursor: 'pointer' }}
                  onMouseEnter={() => { clearTimeout(chartTimerRef.current[key]); showChartPreview(aData, bx, ly, t, allNodes, allEdges); }}
                  onMouseLeave={() => hideChartPreview(key)}
                  onClick={e => { e.stopPropagation(); document.getElementById('edge-chart-preview')?.remove(); onShowEdgePicker(t, lx, ly); }}
                />
                <text x={bx} y={ly + 4} textAnchor="middle" fill="#6B5FBF" fontSize={11} pointerEvents="none">/</text>
              </>);
            })()}

            {/* Hover hint (no annotations) */}
            {!hasAnnotation && (<>
              <rect className="edge-hint-sq" x={lx - 8} y={ly - 8} width={16} height={16} rx={2}
                fill="#FEFCF8" stroke="#BCBBB7" strokeWidth={0.8} opacity={0}
                style={{ transition: 'opacity 0.15s', cursor: 'pointer' }} pointerEvents="none" />
              <text className="edge-hint-tx" x={lx} y={ly + 5} textAnchor="middle" fill="#BCBBB7"
                fontSize={10} opacity={0} pointerEvents="none" style={{ transition: 'opacity 0.15s' }}>+</text>
            </>)}
          </g>
        );
      })}

      {/* Cross / back edges */}
      {crossEdges.map(ce => {
        const fn = allNodes.find(n => n.id === ce.fromId);
        const tn = allNodes.find(n => n.id === ce.toId);
        if (!fn || !tn) return null;
        const fx = fn.x! + NW, fy = centerY(fn);
        const tx = tn.x! + NW, ty = centerY(tn);
        const R = Math.max(80, Math.abs(fx - tx) * 0.35 + 60);
        const d = `M${fx} ${fy} C${fx + R} ${fy} ${tx + R} ${ty} ${tx} ${ty}`;
        const color  = ce.type === 'back' ? '#C8963C' : '#ABABAA';
        const dash   = ce.type === 'back' ? '7 4' : '3 4';
        const marker = ce.type === 'back' ? 'url(#arr-back)' : 'url(#arr-ref)';
        const lx = (fx + fx + R + tx + R + tx) / 4;
        const ly = (fy + ty) / 2;
        const typeIcon = ce.type === 'back' ? '↩' : '⤳';
        const labelStr = ce.label ? `${typeIcon} ${ce.label}` : typeIcon;
        const tw = labelStr.length * 6 + 10;
        return (
          <g key={ce.id}>
            <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray={dash} markerEnd={marker} pointerEvents="none" />
            <path d={d} fill="none" stroke="rgba(0,0,0,0)" strokeWidth={14} pointerEvents="stroke"
              style={{ cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); onShowCrossEdgePicker(ce, lx, ly); }} />
            <rect x={lx - tw / 2} y={ly - 9} width={tw} height={14} rx={3}
              fill="#FEFCF8" stroke={color} strokeWidth={1} pointerEvents="none" />
            <text x={lx} y={ly + 4} textAnchor="middle" fill={color} fontSize={9} fontFamily={FF} pointerEvents="none">{labelStr}</text>
          </g>
        );
      })}
    </svg>
  );
}
