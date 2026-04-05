import { useState, useEffect, useRef } from 'react';
import { cn } from '../../lib/utils';

interface InteractiveGridPatternProps extends React.SVGProps<SVGSVGElement> {
  width?: number;
  height?: number;
  squares?: [number, number];
  className?: string;
  squaresClassName?: string;
}

export function InteractiveGridPattern({
  width = 40,
  height = 40,
  squares = [24, 24],
  className,
  squaresClassName,
  ...props
}: InteractiveGridPatternProps) {
  const [horizontal, vertical] = squares;
  const [hoveredSquare, setHoveredSquare] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Track hover via global mousemove so it works even when elements
  // with higher z-index sit on top of the SVG.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const col = Math.floor(x / width);
      const row = Math.floor(y / height);
      if (col >= 0 && col < horizontal && row >= 0 && row < vertical) {
        setHoveredSquare(row * horizontal + col);
      } else {
        setHoveredSquare(null);
      }
    };
    const onLeave = () => setHoveredSquare(null);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, [width, height, horizontal, vertical]);

  return (
    <svg
      ref={svgRef}
      width={width * horizontal}
      height={height * vertical}
      className={cn(className)}
      style={{ pointerEvents: 'none', ...(props.style as React.CSSProperties) }}
      {...props}
    >
      {Array.from({ length: horizontal * vertical }).map((_, index) => {
        const x = (index % horizontal) * width;
        const y = Math.floor(index / horizontal) * height;
        return (
          <rect
            key={index}
            x={x}
            y={y}
            width={width}
            height={height}
            className={cn(squaresClassName)}
            style={{
              fill: hoveredSquare === index ? 'rgba(26,25,22,0.07)' : 'transparent',
              stroke: 'rgba(26,25,22,0.07)',
              transition: hoveredSquare === index ? 'fill 80ms ease-in' : 'fill 1000ms ease-out',
            }}
          />
        );
      })}
    </svg>
  );
}
