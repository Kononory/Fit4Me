/**
 * Adapted from MagicUI animated-beam (magicuidesign/magicui)
 * Source: apps/www/registry/magicui/animated-beam.tsx
 *
 * Adaptation: accepts a pre-computed `pathD` string (cubic bezier) instead of
 * containerRef/fromRef/toRef, so it can be used within our existing SVG canvas
 * where edge paths are already calculated from tree layout coordinates.
 *
 * The animation technique is identical to the original:
 * Framer Motion's motion.linearGradient animating x1/x2 to create a traveling gradient.
 */
import { useId } from 'react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';

export interface AnimatedBeamProps {
  pathD: string;                       // Pre-computed SVG path (cubic bezier)
  pathColor?: string;
  pathWidth?: number;
  pathOpacity?: number;
  gradientStartColor?: string;
  gradientStopColor?: string;
  delay?: number;
  duration?: number;
  reverse?: boolean;
  className?: string;
}

export function AnimatedBeam({
  pathD,
  pathColor = 'gray',
  pathWidth = 2,
  pathOpacity = 0,                     // Base path is invisible — handled by EdgeLayer
  gradientStartColor = '#ffaa40',
  gradientStopColor = '#9c40ff',
  delay = 0,
  duration = 5,
  reverse = false,
  className,
}: AnimatedBeamProps) {
  const id = useId();

  const gradientCoordinates = reverse
    ? { x1: ['90%', '-10%'], x2: ['100%', '0%'], y1: ['0%', '0%'], y2: ['0%', '0%'] }
    : { x1: ['10%', '110%'], x2: ['0%', '100%'], y1: ['0%', '0%'], y2: ['0%', '0%'] };

  return (
    <g className={cn('pointer-events-none', className)}>
      {/* Dim base path (hidden — edge already drawn by EdgeLayer) */}
      <path
        d={pathD}
        stroke={pathColor}
        strokeWidth={pathWidth}
        strokeOpacity={pathOpacity}
        strokeLinecap="round"
        fill="none"
      />
      {/* Animated gradient beam */}
      <path
        d={pathD}
        strokeWidth={pathWidth + 0.5}
        stroke={`url(#${id})`}
        strokeOpacity="1"
        strokeLinecap="round"
        fill="none"
      />
      <defs>
        <motion.linearGradient
          id={id}
          gradientUnits="userSpaceOnUse"
          initial={{ x1: '0%', x2: '0%', y1: '0%', y2: '0%' }}
          animate={{
            x1: gradientCoordinates.x1,
            x2: gradientCoordinates.x2,
            y1: gradientCoordinates.y1,
            y2: gradientCoordinates.y2,
          }}
          transition={{
            delay,
            duration,
            ease: [0.16, 1, 0.3, 1],
            repeat: Infinity,
            repeatDelay: 15 - duration,    // 15s total cycle
          }}
        >
          <stop stopColor={gradientStartColor} stopOpacity="0" />
          <stop stopColor={gradientStartColor} />
          <stop offset="32.5%" stopColor={gradientStopColor} />
          <stop offset="100%" stopColor={gradientStopColor} stopOpacity="0" />
        </motion.linearGradient>
      </defs>
    </g>
  );
}
