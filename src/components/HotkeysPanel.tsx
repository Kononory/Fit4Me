import { useState } from 'react';

interface Props {
  onClose: () => void;
}

type Tab = 'nodes' | 'canvas' | 'flow';

const TABS: { id: Tab; label: string }[] = [
  { id: 'nodes',  label: 'Nodes' },
  { id: 'canvas', label: 'Canvas' },
  { id: 'flow',   label: 'Flow' },
];

const SHORTCUTS: Record<Tab, { key: string; desc: string }[]> = {
  nodes: [
    { key: 'Right +',      desc: 'Add child node' },
    { key: 'Bottom +',     desc: 'Add sibling node' },
    { key: 'Double-click', desc: 'Rename node inline' },
    { key: 'Delete',       desc: 'Delete selected node' },
    { key: '⌘E',           desc: 'Open / close text editor' },
    { key: 'Shift+click',  desc: 'Multi-select nodes' },
    { key: 'Drag',         desc: 'Swap / connect nodes' },
    { key: 'Alt+drag',     desc: 'Force reference edge' },
  ],
  canvas: [
    { key: 'Scroll',       desc: 'Pan canvas' },
    { key: 'Ctrl+Scroll',  desc: 'Zoom in / out' },
    { key: 'Pinch',        desc: 'Zoom in / out (touch)' },
    { key: '⊕ (toolbar)',  desc: 'Toggle free position mode' },
    { key: '−/+ (toolbar)', desc: 'Zoom out / in' },
    { key: '? or toolbar', desc: 'Toggle this panel' },
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
    <div id="hk-backdrop" onClick={onClose}>
      <div id="hk-panel" onClick={e => e.stopPropagation()}>
        <div id="hk-header">
          <span id="hk-title">Keyboard Shortcuts</span>
          <button id="hk-close" onClick={onClose}>×</button>
        </div>
        <div id="hk-tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`hk-tab${tab === t.id ? ' hk-tab-active' : ''}`}
              onClick={() => setTab(t.id)}
            >{t.label}</button>
          ))}
        </div>
        <div id="hk-list">
          {SHORTCUTS[tab].map(s => (
            <div key={s.key} className="hk-row">
              <kbd className="hk-key">{s.key}</kbd>
              <span className="hk-desc">{s.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
