# Store

Zustand global state — flows, selection, undo/redo, drag, UI flags, and cloud save scheduling.

## Store
Single source of truth for all app state, built with Zustand 5. All [[flow#Flow]] mutations, undo/redo, drag state, and UI flags live here. Cloud save scheduling is also coordinated from this module.

Source: `src/store.ts`

## State Shape
Key fields in the Zustand store.

| Field | Type | Purpose |
|-------|------|---------|
| `flows` | `Flow[]` | All flows |
| `activeId` | `string` | Currently visible flow |
| `sel` | `string \| null` | Selected branch ID |
| `selNodeId` | `string \| null` | Selected node ID |
| `selTick` | `number` | Increments on selection — use as animation key |
| `undoStacks` | `Map<id, string[]>` | Per-flow undo history (JSON snapshots, max 60) |
| `drag` | `DragState` | Current drag operation |
| `textEditOpen` | `boolean` | Whether outline editor is open |

## Key Mutations
Core methods that change flow data — always `pushUndo()` before `updateActiveTree()`.

- `updateActiveTree(tree)` — replace active flow's tree
- `setFlows(flows)` — replace entire flows array (e.g. after cloud load)
- `setActiveId(id)` — switch active flow; persists to localStorage

## Undo / Redo
`pushUndo()` serialises the current tree to JSON and pushes onto the active flow's undo stack (capped at 60). `undo()` pops and restores; `redo()` does the reverse. Both also trigger `scheduleCloudSave`.

## Cloud Save Integration
`scheduleCloudSave(flow)` debounces Supabase writes 2s after each change. `flushCloudSaves(flows)` fires all pending saves immediately (called on `beforeunload`). See [[storage#Storage]].
