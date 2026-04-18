import { useMemo, useState } from "react"
import { X } from "lucide-react"

import { useStore } from "@/store"
import { Kbd } from "@/components/ui/kbd"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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
    <div className="grid grid-cols-2 gap-x-6 gap-y-1 pt-2">
      {[cols.a, cols.b].map((col, ci) => (
        <div key={ci} className="flex flex-col gap-1">
          {col.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-3 rounded-md px-2 py-1 hover:bg-muted">
              <Kbd className="shrink-0">{s.key}</Kbd>
              <span className="text-[11px] text-muted-foreground">{s.desc}</span>
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
      <PopoverContent side="top" align="end" sideOffset={12} className="w-[520px] p-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Keyboard shortcuts
          </div>
          <button
            className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setHotkeysOpen(false)}
            aria-label="Close shortcuts"
          >
            <X data-icon="inline-start" />
            Close
          </button>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mt-2">
          <TabsList variant="default">
            <TabsTrigger value="nodes">Nodes</TabsTrigger>
            <TabsTrigger value="canvas">Canvas</TabsTrigger>
            <TabsTrigger value="flow">Flow</TabsTrigger>
          </TabsList>

          <TabsContent value="nodes">
            <ShortcutGrid items={SHORTCUTS.nodes} />
          </TabsContent>
          <TabsContent value="canvas">
            <ShortcutGrid items={SHORTCUTS.canvas} />
          </TabsContent>
          <TabsContent value="flow">
            <ShortcutGrid items={SHORTCUTS.flow} />
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  )
}

