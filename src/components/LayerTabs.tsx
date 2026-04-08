import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { useStore } from '../store';

export function LayerTabs() {
  const { activeLayer, setActiveLayer } = useStore();

  return (
    <div id="layer-tabs">
      <Tabs value={activeLayer} onValueChange={v => setActiveLayer(v as typeof activeLayer)}>
        <TabsList className="layer-tabs-list">
          <TabsTrigger value="outline" className="layer-tab">Outline</TabsTrigger>
          <TabsTrigger value="nodes"   className="layer-tab">Nodes</TabsTrigger>
          <TabsTrigger value="events"  className="layer-tab">Events</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
