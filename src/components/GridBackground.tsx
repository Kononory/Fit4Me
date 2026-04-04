import { useEffect, useRef, useCallback, useState } from 'react';

const GRID_CELL = 40;

interface Props {
  vpRef: React.RefObject<HTMLDivElement | null>;
}

export function GridBackground({ vpRef }: Props) {
  const [size, setSize] = useState({ w: window.innerWidth - 148, h: window.innerHeight });
  const activeCell = useRef<SVGRectElement | null>(null);
  const cellsRef   = useRef<SVGRectElement[]>([]);
  const colsRef    = useRef(0);

  const rebuild = useCallback(() => {
    setSize({ w: window.innerWidth - 148, h: window.innerHeight });
  }, []);

  useEffect(() => {
    window.addEventListener('resize', rebuild);
    return () => window.removeEventListener('resize', rebuild);
  }, [rebuild]);

  const cols = Math.ceil(size.w / GRID_CELL) + 1;
  const rows = Math.ceil(size.h / GRID_CELL) + 1;
  colsRef.current = cols;

  // Build cells array for mouse tracking
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const svg = svgRef.current; if (!svg) return;
    cellsRef.current = Array.from(svg.querySelectorAll<SVGRectElement>('.grid-cell'));
  });

  useEffect(() => {
    const vp = vpRef.current; if (!vp) return;
    const onMove = (e: MouseEvent) => {
      const vr = vp.getBoundingClientRect();
      const col = Math.floor((e.clientX - vr.left) / GRID_CELL);
      const row = Math.floor((e.clientY - vr.top)  / GRID_CELL);
      const cell = cellsRef.current[row * colsRef.current + col] ?? null;
      if (cell !== activeCell.current) {
        activeCell.current?.classList.remove('gc-active');
        cell?.classList.add('gc-active');
        activeCell.current = cell;
      }
    };
    const onLeave = () => {
      activeCell.current?.classList.remove('gc-active');
      activeCell.current = null;
    };
    vp.addEventListener('mousemove', onMove);
    vp.addEventListener('mouseleave', onLeave);
    return () => { vp.removeEventListener('mousemove', onMove); vp.removeEventListener('mouseleave', onLeave); };
  }, [vpRef, size]);

  const rects: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      rects.push(
        <rect key={`${r}-${c}`} className="grid-cell"
          x={c * GRID_CELL} y={r * GRID_CELL}
          width={GRID_CELL} height={GRID_CELL} />,
      );
    }
  }

  return (
    <svg ref={svgRef} id="grid-svg"
      width={cols * GRID_CELL} height={rows * GRID_CELL}
      style={{ position: 'fixed', left: 148, top: 0, pointerEvents: 'none', zIndex: 0 }}>
      {rects}
    </svg>
  );
}
