import { useState, useEffect } from 'react';
import { InteractiveGridPattern } from './magicui/interactive-grid-pattern';
import { useStore } from '../store';

const CELL = 40;

interface Props {
  vpRef: React.RefObject<HTMLDivElement | null>;
}

export function GridBackground({ vpRef: _vpRef }: Props) {
  const { leftSidebarCollapsed } = useStore();
  const sidebarW = leftSidebarCollapsed ? 40 : 148;
  const [winSize, setWinSize] = useState({ w: window.innerWidth, h: window.innerHeight });

  useEffect(() => {
    const onResize = () => setWinSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const cols = Math.ceil((winSize.w - sidebarW) / CELL) + 1;
  const rows = Math.ceil(winSize.h / CELL) + 1;

  return (
    <InteractiveGridPattern
      id="grid-svg"
      width={CELL}
      height={CELL}
      squares={[cols, rows]}
      style={{ position: 'fixed', left: sidebarW, top: 0, zIndex: 0, transition: 'left 0.18s ease' }}
    />
  );
}
