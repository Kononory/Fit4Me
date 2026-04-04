/**
 * From MagicUI interactive-grid-pattern (magicuidesign/magicui)
 * Source: apps/www/registry/magicui/interactive-grid-pattern.tsx
 *
 * Minimal adaptation: removed Tailwind border/absolute classes that conflict
 * with our fixed-position grid overlay. Kept core hover logic identical.
 */
import { useState } from 'react';
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

  return (
    <svg
      width={width * horizontal}
      height={height * vertical}
      className={cn(className)}
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
            onMouseEnter={() => setHoveredSquare(index)}
            onMouseLeave={() => setHoveredSquare(null)}
          />
        );
      })}
    </svg>
  );
}
