import { useMemo, useState } from "react"
import { X } from "lucide-react"

import { useStore } from "@/store"
import { Kbd } from "@/components/ui/kbd"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

type Tab = "nodes" | "canvas" | "flow"

const SHORTCUTS: Record<Tab, { key: string; desc: string }[]> = {
  nodes: [
    { key: "Right +", desc: "Add child node" },
    { key: "Bottom +", desc: "Add sibling node" },
    { key: "Double-click", desc: "Rename node inline" },
    { key: "Delete", desc: "Delete selected node" },
    { key: "⌘E", desc: "Open / close text editor" },
    { key: "Shift+click", desc: "Multi-select nodes" },
    { key: "2 selected", desc: "Swap nodes or swap subtrees" },
    { key: "Drag", desc: "Swap / connect nodes" },
    { key: "Alt+drag", desc: "Force reference edge" },
  ],
  canvas: [
    { key: "Scroll", desc: "Pan canvas" },
    { key: "Ctrl+Scroll", desc: "Zoom in / out" },
    { key: "Pinch", desc: "Zoom in / out (touch)" },
    { key: "Lock (toolbar)", desc: "Toggle free positioning" },
    { key: "−/+ (toolbar)", desc: "Zoom out / in" },
    { key: "Shift+?", desc: "Toggle shortcuts" },
  ],
  flow: [
    { key: "⌘Z", desc: "Undo" },
    { key: "⌘Y / ⌘⇧Z", desc: "Redo" },
    { key: "Save", desc: "Save to cloud" },
    { key: "⌘E", desc: "Open outline editor" },
    { key: "Tab", desc: "Indent in outline editor" },
    { key: "⇧Tab", desc: "Outdent in outline editor" },
    { key: "⌘↵", desc: "Apply outline changes" },
  ],
}

function ShortcutGrid({ items }: { items: { key: string; desc: string }[] }) {
  const cols = useMemo(() => {
    const mid = Math.ceil(items.length / 2)
    return { a: items.slice(0, mid), b: items.slice(mid) }
  }, [items])

  return (
    <div className="hk-grid">
      {[cols.a, cols.b].map((col, ci) => (
        <div key={ci} className="hk-col">
          {col.map((s) => (
            <div key={s.key} className="hk-row hk-row-compact">
              <Kbd className="shrink-0">{s.key}</Kbd>
              <span className="hk-desc">{s.desc}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export function HotkeysPopover() {
  const { hotkeysOpen, setHotkeysOpen, activeLayer } = useStore()
  const [tab, setTab] = useState<Tab>("nodes")

  // When user is on Outline, the app historically hid hotkeys.
  const disabled = activeLayer === "outline"

  return (
    <Popover open={hotkeysOpen} onOpenChange={(o) => setHotkeysOpen(o)}>
      <PopoverTrigger
        id="hk-float-btn"
        title={disabled ? "Keyboard shortcuts unavailable in Outline layer" : "Keyboard shortcuts (Shift+?)"}
        disabled={disabled}
        className={hotkeysOpen ? "tb-active" : ""}
        onClick={() => setHotkeysOpen(!hotkeysOpen)}
      >
        ?
      </PopoverTrigger>
      <PopoverContent side="top" align="end" sideOffset={12} className="w-[540px] p-0">
        <div id="hk-panel" style={{ position: "static" }}>
          <div id="hk-header">
            <span id="hk-title">Keyboard Shortcuts</span>
            <button id="hk-close" onClick={() => setHotkeysOpen(false)} aria-label="Close shortcuts">
              <X size={14} />
            </button>
          </div>
          <div id="hk-tabs">
            {(["nodes", "canvas", "flow"] as const).map((t) => (
              <button
                key={t}
                className={`hk-tab${tab === t ? " hk-tab-active" : ""}`}
                onClick={() => setTab(t)}
              >
                {t === "nodes" ? "Nodes" : t === "canvas" ? "Canvas" : "Flow"}
              </button>
            ))}
          </div>
          <div id="hk-list" style={{ maxHeight: 260 }}>
            <ShortcutGrid items={SHORTCUTS[tab]} />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

