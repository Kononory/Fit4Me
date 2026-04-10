import { Minus, Plus } from 'lucide-react';
import { useStore } from '../store';
import { Button } from './ui/button';

export function ZoomControls() {
  const { activeLayer, zoom, setZoom, evmZoom, setEvmZoom } = useStore();
  if (activeLayer === 'outline') return null;
  const z = activeLayer === 'events' ? evmZoom : zoom;
  const setZ = activeLayer === 'events' ? setEvmZoom : setZoom;
  return (
    <div className="fixed bottom-5 left-[156px] z-[60] flex items-center overflow-hidden rounded-sm border-[1.5px] border-foreground bg-background font-mono">
      <Button variant="ghost" size="icon-xs" className="rounded-none border-r border-border h-[26px] w-6" onClick={() => setZ(z - 0.1)}><Minus size={11} /></Button>
      <button className="min-w-[38px] px-1 text-center text-[9px] text-muted-foreground hover:text-foreground cursor-pointer tabular-nums leading-[26px] transition-colors" onClick={() => setZ(1)} title="Reset zoom">{Math.round(z * 100)}%</button>
      <Button variant="ghost" size="icon-xs" className="rounded-none border-l border-border h-[26px] w-6" onClick={() => setZ(z + 0.1)}><Plus size={11} /></Button>
    </div>
  );
}
