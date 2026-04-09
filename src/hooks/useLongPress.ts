import { useRef } from 'react';

export function useLongPress(callback: () => void, delay = 400) {
  const timerRef   = useRef<number>(0);
  const didFireRef = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    didFireRef.current = false;
    timerRef.current = window.setTimeout(() => {
      didFireRef.current = true;
      callback();
    }, delay);
  };

  const cancel = () => {
    clearTimeout(timerRef.current);
    timerRef.current = 0;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (Math.hypot(e.movementX, e.movementY) > 3) cancel();
  };

  return { onPointerDown, onPointerUp: cancel, onPointerLeave: cancel, onPointerMove, didFireRef };
}
