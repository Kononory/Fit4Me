import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { useStore } from '../store';

export function LayerTabs() {
  const { activeLayer, setActiveLayer } = useStore();
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[100]">
      <Tabs value={activeLayer} onValueChange={v => setActiveLayer(v as typeof activeLayer)}>
        <TabsList className="h-auto gap-0.5 rounded-sm border-[1.5px] border-border bg-[#F2F1ED] p-0.5">
          <TabsTrigger value="outline" className="h-auto rounded-[3px] px-3.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.07em] text-muted-foreground data-active:bg-foreground data-active:text-background data-active:shadow-none">Outline</TabsTrigger>
          <TabsTrigger value="nodes"   className="h-auto rounded-[3px] px-3.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.07em] text-muted-foreground data-active:bg-foreground data-active:text-background data-active:shadow-none">Nodes</TabsTrigger>
          <TabsTrigger value="events"  className="h-auto rounded-[3px] px-3.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.07em] text-muted-foreground data-active:bg-foreground data-active:text-background data-active:shadow-none">Events</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
