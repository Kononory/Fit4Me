import { useState, useEffect } from 'react';
import { InteractiveGridPattern } from './magicui/interactive-grid-pattern';
import { useStore } from '../store';

const CELL = 40;

interface Props {
  vpRef: React.RefObject<HTMLDivElement | null>;
}

export function GridBackground({ vpRef: _vpRef }: Props) {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const { leftSidebarCollapsed } = useStore();

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const cols = Math.ceil(size.w / CELL) + 1;
  const rows = Math.ceil(size.h / CELL) + 1;

  return (
    <InteractiveGridPattern
      id="grid-svg"
      width={CELL}
      height={CELL}
      squares={[cols, rows]}
      // 2. Змінюємо об'єкт style, щоб він став динамічним
      style={{ 
        position: 'fixed', 
        left: leftSidebarCollapsed ? 40 : 148, 
        top: 0, 
        zIndex: 0,
        transition: 'left 0.18s ease'
      }}
    />
  );
}
