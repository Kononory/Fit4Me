import { useState, useEffect } from 'react';
import { InteractiveGridPattern } from './magicui/interactive-grid-pattern';

const CELL = 40;

interface Props {
  vpRef: React.RefObject<HTMLDivElement | null>;
}

export function GridBackground({ vpRef: _vpRef }: Props) {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });

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
      style={{ position: 'fixed', left: 148, top: 0, zIndex: 0 }}
    />
  );
}
