# Retention

Funnel analytics widget and the hotkeys reference panel accessed via the / button.

## Retention
Funnel analytics overlay that visualises drop-off rates across stages of a user flow. Data is a `RetentionPoint[]` — percentage + stage label pairs.

Source: `src/components/RetentionWidget.tsx`  
Source: `src/retention.ts` — `buildChart()`  
Source: `src/data.ts` — `RETENTION_DATA` (defaults)

## Retention Data Model
`RetentionPoint { pct: number; s: string }` — a percentage (0–100) and a stage label. Stored at two levels:

- **Flow level** — `Flow.retentionData[]` — the global chart in the retention widget
- **Edge level** — `TreeNode.edgeRetention[]` — per-edge sparkline on [[edges#Edge Layer]] lines

## Retention Widget
Hover the `/` button (bottom-right, `#ret-marker`) to open a popup: funnel bar chart, summary line (% reaching final stage), and an editable table of stage/percentage pairs. Changes save immediately to the active flow via `setFlows`.

Click the `/` button to open the [[retention#Hotkeys Panel]] instead.

## Hotkeys Panel
Opened by clicking `#ret-marker`. Shows all keyboard shortcuts grouped by context (Global, Outline editor, Nodes, Flow tabs). Close with `Esc` or clicking the backdrop. Lives at z-index 500.

Source: `src/components/HotkeysPanel.tsx`
