# Canvas

Rendering, interaction, and navigation for the flowchart drawing surface.

## Canvas
The main drawing surface — renders all nodes of the active [[flow#Flow]] using [[layout#Layout]]-computed positions and handles all direct interaction (select, drag, inline edit). The [[edges#Edge Layer]] SVG sits behind nodes at z-index 1.

Source: `src/components/Canvas.tsx`  
Source: `src/components/Viewport.tsx` — scroll/pan wrapper

## Node Rendering
Each node is a `NodeEl` component. Visual state is a `SelectionState` that dims unrelated branches when a node is selected.

| State | Meaning |
|-------|---------|
| `act` | Active — selected branch |
| `par` | Parent of selected |
| `dim` | Dimmed — different branch |
| `def` | Default — no selection |

Source: `src/components/NodeEl.tsx`

## Drag and Drop
Drag state is managed globally in [[store#Store]] via `DragState`. Two modes: `swap` (drag node onto another to swap positions) and `connect` (drag from `+` handle to create a [[edges#Cross-Edge]] or reparent). A `DragOverlay` ghost follows the cursor.

Source: `src/components/DragOverlay.tsx`

## Inline Editing
Double-clicking a node's label activates inline edit. Confirm with `Enter`, cancel with `Esc`. Calls `updateActiveTree` on commit.

## Viewport
Wraps `Canvas` in a pannable container. Pan by dragging on empty canvas space.

Source: `src/components/Viewport.tsx`
