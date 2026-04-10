import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Kbd } from './ui/kbd';

interface Props { onClose: () => void; }
type Tab = 'nodes' | 'canvas' | 'flow';

const SHORTCUTS: Record<Tab, { key: string; desc: string }[]> = {
  nodes: [
    { key: 'Right +',      desc: 'Add child node' },
    { key: 'Bottom +',     desc: 'Add sibling node' },
    { key: 'Double-click', desc: 'Rename node inline' },
    { key: 'Delete',       desc: 'Delete selected node' },
    { key: '⌘E',           desc: 'Open / close text editor' },
    { key: 'Shift+click',  desc: 'Multi-select nodes' },
    { key: '2 selected',   desc: 'Swap nodes or swap subtrees' },
    { key: 'Drag',         desc: 'Swap / connect nodes' },
    { key: 'Alt+drag',     desc: 'Force reference edge' },
  ],
  canvas: [
    { key: 'Scroll',        desc: 'Pan canvas' },
    { key: 'Ctrl+Scroll',   desc: 'Zoom in / out' },
    { key: 'Pinch',         desc: 'Zoom in / out (touch)' },
    { key: '⊕ (toolbar)',   desc: 'Toggle free position mode' },
    { key: '−/+ (toolbar)', desc: 'Zoom out / in' },
    { key: 'Shift+?',       desc: 'Toggle this panel' },
    { key: 'Esc',           desc: 'Close this panel' },
  ],
  flow: [
    { key: '⌘Z',           desc: 'Undo' },
    { key: '⌘Y / ⌘⇧Z',    desc: 'Redo' },
    { key: 'Save',         desc: 'Save to cloud' },
    { key: '⌘E',           desc: 'Open outline editor' },
    { key: 'Tab',          desc: 'Indent in outline editor' },
    { key: '⇧Tab',         desc: 'Outdent in outline editor' },
    { key: '⌘↵',          desc: 'Apply outline changes' },
  ],
};

export function HotkeysPanel({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('nodes');
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-sm font-mono" showCloseButton>
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={v => setTab(v as Tab)}>
          <TabsList className="w-full">
            <TabsTrigger value="nodes" className="flex-1 text-xs">Nodes</TabsTrigger>
            <TabsTrigger value="canvas" className="flex-1 text-xs">Canvas</TabsTrigger>
            <TabsTrigger value="flow" className="flex-1 text-xs">Flow</TabsTrigger>
          </TabsList>
          {(['nodes','canvas','flow'] as Tab[]).map(t => (
            <TabsContent key={t} value={t} className="mt-3 space-y-1.5">
              {SHORTCUTS[t].map(s => (
                <div key={s.key} className="flex items-center gap-3">
                  <Kbd className="shrink-0 text-[10px]">{s.key}</Kbd>
                  <span className="text-xs text-muted-foreground">{s.desc}</span>
                </div>
              ))}
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
