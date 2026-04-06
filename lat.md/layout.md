# Layout

Pure layout algorithm and pixel constants used by canvas rendering and edge drawing.

## Layout
The **Layout** system computes pixel positions for all nodes in a [[tree#Tree]] before rendering. It is a pure function with no side effects. All [[canvas#Canvas]] rendering and [[edges#Edge Layer]] drawing depends on these computed values.

Source: `src/layout.ts`

## Layout Constants
Fixed pixel constants used throughout rendering — never hardcode these values, always import from `layout.ts`.

| Constant | Value | Meaning |
|----------|-------|---------|
| `NW` | 156 | Node width (px) |
| `NH` | 36 | Node height (px) |
| `LW` | 184 | Level width — horizontal gap between depth levels |
| `RH` | 40 | Row height — vertical gap between rows |
| `PAD` | 40 | Canvas padding on all sides |

## Layout Algorithm
`doLayout(node, depth, startRow)` runs depth-first, assigning `depth`, `x = PAD + depth × LW`, and `row` to every node. Leaf nodes get `row = startRow`. Parent row is the midpoint between its first and last child's rows.

## Helper Functions
Utility functions exported alongside the layout algorithm.

- `flattenTree(root)` — depth-first array of all nodes (used for rendering)
- `collectEdges(root)` — all `[parent, child]` pairs (used by [[edges#Edge Layer]])
- `canvasSize(allNodes)` — `{ cw, ch }` from max depth and row
- `centerY(node)` — `PAD + row × RH + RH/2`
- `topY(node)` — `centerY − NH/2`
