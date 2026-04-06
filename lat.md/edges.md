# Edges

Tree branch lines, cross-node connections, and the edge picker UI.

## Edge Layer
Draws the branch lines connecting parent nodes to children on the [[canvas#Canvas]]. Lines are rendered as SVG paths in a fixed overlay behind the nodes at z-index 1.

Source: `src/components/EdgeLayer.tsx`

Each tree edge can carry metadata from the source [[tree#Tree]] node: `edgeLabel` (text along the line), `edgeStatus` (`up/down/ok/warn` dot), and `edgeRetention` ([[retention#Retention]] sparkline).

## Cross-Edge
A non-tree connection between any two nodes — can span branches or levels. Stored in `Flow.crossEdges[]`, separate from the tree structure.

Source: `src/types.ts` — `CrossEdge`

| Field | Values | Meaning |
|-------|--------|---------|
| `type` | `back` | Return arrow — curved back-path |
| `type` | `ref` | Cross-reference — dashed line |
| `label` | string | Optional label on the edge |

## Edge Picker
The UI for adding and editing edges. Opens as a floating panel when the user interacts with the `+` handle on a node.

Source: `src/components/EdgePicker.tsx`

Modes: `main` (choose edge type), `cross` (edit existing cross-edge), `label-edit` (edit edge label), `analytics` (view/edit [[retention#Retention]] data on an edge).
