import { Minus, Plus } from 'lucide-react';
import { useStore } from '../store';

export function ZoomControls() {
  const { activeLayer, zoom, setZoom, evmZoom, setEvmZoom } = useStore();

  if (activeLayer === 'outline') return null;

  const z    = activeLayer === 'events' ? evmZoom : zoom;
  const setZ = activeLayer === 'events' ? setEvmZoom : setZoom;

  return (
    <div id="zoom-controls">
      <button className="zoom-btn" title="Zoom out (Ctrl+Scroll)" onClick={() => setZ(z - 0.1)}><Minus size={12} /></button>
      <span id="zoom-label" onClick={() => setZ(1)} title="Reset zoom">{Math.round(z * 100)}%</span>
      <button className="zoom-btn" title="Zoom in (Ctrl+Scroll)" onClick={() => setZ(z + 0.1)}><Plus size={12} /></button>
    </div>
  );
}
