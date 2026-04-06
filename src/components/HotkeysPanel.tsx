import { useEffect } from 'react';

interface HotkeyRow {
  keys: string[];
  label: string;
}

interface HotkeyGroup {
  title: string;
  rows: HotkeyRow[];
}

const GROUPS: HotkeyGroup[] = [
  {
    title: 'Global',
    rows: [
      { keys: ['⌘Z'],       label: 'Undo' },
      { keys: ['⌘Y', '⌘⇧Z'], label: 'Redo' },
      { keys: ['⌘E'],       label: 'Open outline editor' },
    ],
  },
  {
    title: 'Outline editor',
    rows: [
      { keys: ['⌘↵'],   label: 'Apply changes' },
      { keys: ['Esc'],   label: 'Close' },
      { keys: ['Tab'],   label: 'Indent node (add level)' },
      { keys: ['->'],    label: 'Arrow / "then" prefix → indent level' },
      { keys: ['⇧Tab'],  label: 'Unindent node' },
      { keys: ['⇧↵'],   label: 'New line' },
    ],
  },
  {
    title: 'Nodes',
    rows: [
      { keys: ['Click'],  label: 'Select node' },
      { keys: ['↵'],      label: 'Confirm inline edit' },
      { keys: ['Esc'],    label: 'Cancel inline edit' },
      { keys: ['+ drag'], label: 'Add child / connect nodes' },
    ],
  },
  {
    title: 'Flow tabs',
    rows: [
      { keys: ['↵'],   label: 'Confirm rename' },
      { keys: ['Esc'], label: 'Cancel rename' },
      { keys: ['⌘↵'], label: 'Create flow from text' },
    ],
  },
];

interface Props {
  onClose: () => void;
}

export function HotkeysPanel({ onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div id="hk-overlay" onClick={onClose}>
      <div id="hk-panel" onClick={e => e.stopPropagation()}>
        <div id="hk-header">
          <span id="hk-title">Hotkeys</span>
          <button id="hk-close" onClick={onClose}>×</button>
        </div>
        {GROUPS.map(group => (
          <div key={group.title} className="hk-group">
            <div className="hk-group-title">{group.title}</div>
            {group.rows.map(row => (
              <div key={row.label} className="hk-row">
                <span className="hk-label">{row.label}</span>
                <span className="hk-keys">
                  {row.keys.map((k, i) => (
                    <span key={k}>
                      {i > 0 && <span className="hk-or">or</span>}
                      <kbd className="hk-kbd">{k}</kbd>
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
