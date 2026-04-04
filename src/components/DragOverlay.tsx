import { useStore } from '../store';
import { NW, centerY } from '../layout';

interface Props { width: number; height: number; }

export function DragOverlay({ width, height }: Props) {
  const { drag } = useStore();
  if (!drag.on) return <svg id="drag-ov" width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }} />;

  const { node, target, cx, cy, mode } = drag;
  if (!node) return null;

  const viewBox = `0 0 ${width} ${height}`;
  const fontFamily = 'LatteraMonoLL,Space Mono,monospace';

  if (mode === 'connect') {
    const x1 = node.x! + NW, y1 = centerY(node);
    const x2 = target ? target.x! : cx;
    const y2 = target ? centerY(target) : cy;
    return (
      <svg id="drag-ov" width={width} height={height} viewBox={viewBox} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1A1A1A" strokeWidth={1.5} strokeDasharray="6 3" />
        <circle cx={x1} cy={y1} r={3} fill="#1A1A1A" />
        <circle cx={x2} cy={y2} r={4} fill={target ? '#1A1A1A' : '#BCBBB7'} stroke="#fff" strokeWidth={1.5} />
      </svg>
    );
  }

  if (!target) return <svg id="drag-ov" width={width} height={height} viewBox={viewBox} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }} />;

  const x1 = node.x! + NW / 2, y1 = centerY(node);
  const x2 = target.x! + NW / 2, y2 = centerY(target);
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;

  return (
    <svg id="drag-ov" width={width} height={height} viewBox={viewBox} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1A1A1A" strokeWidth={1.2} strokeDasharray="5 3" strokeOpacity={0.35} />
      <circle cx={x1} cy={y1} r={3.5} fill="#ABABAA" />
      <circle cx={x2} cy={y2} r={3.5} fill="#1A1A1A" />
      <rect x={mx - 13} y={my - 9} width={26} height={18} rx={2} fill="#1A1A1A" />
      <text x={mx} y={my + 5} textAnchor="middle" fill="#fff" fontSize={11} fontFamily={fontFamily}>⇄</text>
    </svg>
  );
}
