# Semantic Zoom / Expanded Node / SubFlow

Read this file when modifying long-press expand, ExpandedNode, or SubFlow.

## State & trigger
- `expandedNodeId: string | null` in Canvas local state
- `useLongPress` hook (400ms, cancels on >3px movement) on NodeEl
- Compact node: `motion.div` with `layoutId=\`node-morph-${n.id}\`` — filtered from allNodes.map() while expanded
- Expanded node: `ExpandedNode` — full-screen `motion.div.en-panel` (position:fixed;inset:0) with same `layoutId`, rendered as sibling of `#cnv` (outside CSS zoom context), wrapped in `AnimatePresence`
- Inner content fades in with `transition.delay:0.15` after morph settles
- CSS zoom note: motion FLIP uses `getBoundingClientRect()` (screen coords) — works at any zoom level

## SubFlow
- Own layout constants: SNW=240 SNH=120 SLW=296 SRH=144 SPAD=40
- SVG bezier edges, independent card nodes
- Does NOT use EdgeLayer or `doLayout` from layout.ts — fully self-contained
- State: `flow` (local useState, initialized from `root.innerFlow`); synced when `root` reference changes via render-phase guard (`prevRoot` ref pattern)

## Data model
- `TreeNode.innerFlow?: TreeNode` — root of independent mini-flowchart owned by the node; edited only in expanded panel; stored as nested JSON within main tree (persists through undo/Supabase via `cloneTree` + JSON.stringify)
- `TreeNode.content?: string` — per-node notes textarea (inside expanded panel cards)

## Card interactions
- click=select, double-click label=inline rename, `+` button=add child, `×` button=delete; content textarea saves on blur
- Add child: `addChildNode(parent)` on `cloneTree(flow)` copy, then `saveFlow(cloned)`
- Delete: `removeNode`; label/content: `findNode` to patch a clone
