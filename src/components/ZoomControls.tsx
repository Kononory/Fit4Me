import { useStore } from '../store';

export function ZoomControls() {
  const { zoom, setZoom } = useStore();

  return (
    <div id="zoom-controls">
      <button className="zoom-btn" title="Zoom out (Ctrl+Scroll)" onClick={() => setZoom(zoom - 0.1)}>−</button>
      <span id="zoom-label" onClick={() => setZoom(1)} title="Reset zoom">{Math.round(zoom * 100)}%</span>
      <button className="zoom-btn" title="Zoom in (Ctrl+Scroll)" onClick={() => setZoom(zoom + 0.1)}>+</button>
    </div>
  );
}
