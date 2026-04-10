# Fit4Me — Claude Code Rules

## Project
Fit4Me is a canvas-based flowchart / mind-map tool built for personal productivity. Users create multi-tab flows of tree-structured nodes, edit them via an indented text outline, connect nodes with typed edges, and persist everything to Supabase. An Anthropic AI integration assists with node content. Deployed on Vercel.

## Stack
- React 19 + TypeScript, Vite 5, Tailwind CSS 4, Zustand 5
- Font: `LatteraMonoLL` / `Space Mono` (monospace everywhere)
- shadcn/ui is installed (`components.json` configured, style: base-nova) — add components with `npx shadcn add <component>`; they land in `src/components/ui/`
- Supporting packages: `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`
- Hand-crafted bespoke components live in `src/components/` (Canvas, NodeEl, etc.); shadcn UI primitives live in `src/components/ui/`

## Storage pattern
- **Local** (`localStorage`) — written on every change, instant, machine-specific
- **Cloud** (Supabase via `/api/*`) — debounced 2s after each change via `scheduleCloudSave()` in `store.ts`
- **Load order** — app mount calls `loadFlowsRemote()` first; cloud wins over localStorage
- **Tab close** — `flushCloudSaves()` fires all pending debounced saves on `beforeunload`
- Never call `saveFlowRemote` directly for auto-saves — always go through `scheduleCloudSave(flow)`

## Repo layout
```
src/
  components/   # UI — Canvas, NodeEl, EdgeLayer, EdgePicker, TextEditPanel, FlowTabs,
  #               Toolbar, RetentionWidget, Viewport, HotkeysPanel, ZoomControls
  hooks/        # useDrag.ts — drag/connect/free-position logic
  store.ts      # Zustand global state (flows, selection, undo/redo, drag, UI flags,
  #               zoom, freeMode, hotkeysOpen)
  types.ts      # TreeNode (incl. px/py free-position fields), Flow, CrossEdge, DragState
  parser.ts     # parseOutline() / treeToOutline() — indented text ↔ tree
  layout.ts     # doLayout(), flattenTree(), canvasSize() — NW=156 NH=36 LW=184 RH=40 PAD=40
  #               centerY(n) and topY(n) respect n.py free-position override
  tree.ts       # findNode, addChildNode, addSiblingNode, removeNode, reparentNode,
  #               swapNodes (subtree), swapNodeMetadata (labels only), cloneTree
  data.ts       # DEFAULT_TREE
  storage.ts    # local + Supabase persistence
  style.css     # all styles (no CSS modules) — read this before adding classes
```

## Node interaction model
- **Right-center `+`** (`.nd-handle-add-child`) — click adds child; drag creates connection/reparents
- **Bottom-center `+`** (`.nd-handle-add-sib`) — click adds sibling below current node
- **Delete key** — deletes selected node (with confirmation if it has children)
- **Double-click** — inline rename
- **Shift+click** — multi-select; when exactly 2 nodes selected, swap action bar appears
- **Drag** (swap mode) — reorders nodes within tree; if freeMode ON and no swap target, free-positions the node (snapped to 20px grid)
- **Group drag** (freeMode + multi-select) — dragging any selected node moves ALL selected nodes by the same delta
- **Connect mode** (drag from right `+`) — creates child or cross-edge

## Free positioning (freeMode)
- Toggle via `⊕` toolbar button → `store.freeMode`
- `TreeNode.px?: number` — free x override (pixel left edge); `TreeNode.py?: number` — free y override (pixel center)
- `px`/`py` are serialised (persist through undo/redo, cloud sync); `x`/`row`/`depth` are computed layout and stripped by `cloneTree`
- After `doLayout()`, call `applyFreePositions(nodes)` (in Viewport) to override `n.x` with `n.px`
- `centerY(n)` / `topY(n)` already check `n.py` — edge coordinates stay correct automatically
- To clear free position on a node: `delete node.px; delete node.py`

## Zoom
- `store.zoom` (0.25–3.0) — applied as CSS `zoom` property on `#cnv`
- With CSS zoom: `getBoundingClientRect()` returns scaled size → divide by zoom to get logical canvas coords in `useDrag`
- `ZoomControls` component (fixed bottom-left, left: 156px, bottom: 20px) — `−` / `%` (click to reset) / `+`
- Pinch zoom: `wheel` with `ctrlKey` in Viewport; 2-finger touch via `pinchRef`

## Hotkeys
| Shortcut | Action |
|---|---|
| `Shift+?` | Toggle hotkeys panel |
| `⌘E` | Toggle outline text editor (open AND close) |
| `⌘Z` / `⌘Y` | Undo / Redo |
| `Delete` | Delete selected node |
| `Double-click` | Inline rename node |

## Fixed UI positions (bottom corners)
- **Bottom-left** (`left: 156px, bottom: 20px`, z-index 60): `#zoom-controls` — zoom −/+
- **Bottom-right** (`right: 52px, bottom: 20px`, z-index 60): `#hk-float-btn` — `?` hotkeys toggle
- **Bottom-right** (`right: 20px, bottom: 20px`, z-index 60): `#ret-marker` — retention widget
- **Swap bar** (`position:fixed, left:50%, bottom:60px`, z-index 50): appears when exactly 2 nodes are multi-selected

## CSS conventions
- All styles in `src/style.css` — no separate files, no CSS modules
- ID-based for unique elements (`#text-edit-panel`), class-based for reusable (`.te-btn`)
- Prefix classes by component: `nd-` nodes, `ep-` edge picker, `te-` text edit, `ft-` flow tabs, `ea-` edge analytics, `ret-` retention, `hk-` hotkeys, `swap-` swap bar
- Z-index ladder: 500 modals/hotkeys → 200 hotkeys backdrop → 155 en-panel (full-screen node flow) → 150 en-backdrop → 100 sidebar → 90 pickers → 60 fixed corners → 50 swap bar → 40 text-edit → 20 handles → 6 drag → 2 nodes → 1 edges
- Color palette: bg `#FEFCF8`/`#F8F7F4`/`#F2F1ED`, text `#1A1A1A`, muted `#AEADA8`/`#9A9995`, border `#DEDDDA`/`#E2E1DC`, red `#B52B1E`, green `#6B9B5E`, orange `#C8963C`
- Node handle sizing: `width:18px; height:18px` — right-center uses `transform:translateY(-50%)`, bottom-center uses `transform:translateX(-50%)`

## State patterns
- Global toggles (e.g. `textEditOpen`, `freeMode`, `hotkeysOpen`, `zoom`) live in `store.ts`
- Component-local UI state uses `useState` — don't pollute the store
- Toggle modals: `useState<'mode-a'|'mode-b'|null>` pattern (see FlowTabs)
- Undo: always call `pushUndo()` before `updateActiveTree()`
- Multi-select: tracked as `Set<string>` in Canvas local state (`multiSelIds`), never in store
- `getMultiSel()` callback (not the Set directly) is passed to `useDrag` to avoid stale closures

## Git
- Active dev branch: `claude/add-text-steps-display-MPzeW`
- Deploy branch: `main`
- Push with: `git push origin main`

## Token efficiency report (on every new feature task)
At the start of each implementation plan, include a one-line estimate:
> **Token cost w/ CLAUDE.md:** ~X k | **Without:** ~Y k | **Saved:** ~Z k

Count saved tokens from skipped work:
- No Explore agent (~8–15 k) — stack/layout/CSS already known
- No full style.css read (~3 k) — conventions documented above
- No store.ts read (~2 k) — state patterns documented above
- No multi-file grep for conventions (~2–5 k) — prefixes/z-index/colors listed above
- Shorter plan (~1–2 k) — no need to explain the project to yourself
- No types.ts / tree.ts read (~1 k each) — all public functions listed in repo layout above

## Post-iteration rule update (mandatory)
After every completed feature, bugfix, or refactor — before closing the task — do the following:

1. **Add any new pattern** discovered during the iteration to the relevant section above (CSS, state, repo layout, etc.)
2. **Document errors encountered** and how they were resolved, as a rule to prevent recurrence:
   - Format: `- [Error type]: [root cause] → [fix]`
   - Add under a `## Known pitfalls` section (create if missing)
3. **Update token estimates** if new files or patterns were read that should be pre-documented
4. **Commit the updated CLAUDE.md** alongside the feature commit — never separately

This keeps CLAUDE.md as a living document and prevents repeating the same mistakes.

## Semantic Zoom / Shared Element Transition
See `docs/semantic-zoom.md` — only read when modifying long-press expand, ExpandedNode, or SubFlow.

## What NOT to do
- Don't add docstrings/comments to unchanged code
- Don't create helper abstractions for one-off logic
- Don't add error handling for impossible states
- Don't launch Explore/Plan agents for targeted searches — use Grep/Glob directly
- Don't read files you don't need to modify
- Don't use Bash for file reads/searches — use Read/Grep/Glob tools
- Don't read style.css in full — conventions are in this file; grep for specific selectors only
- Don't merge feature branches without rebasing on main first (avoids conflict overhead)
- Don't add CSS for removed elements — search for stale IDs before adding new ones

## Known pitfalls
- [CSS zoom + drag]: `getBoundingClientRect()` returns scaled coords — always divide by `zoom` in `useDrag`.
- [Duplicate CSS on merge]: Grep for selector before adding styles — edit in place, don't append a second block.
- [Free-position multi-drag delta]: Store `startNodeX/Y` in `drRef` at `dragBegin` (not cursor). Delta = `snapEndX - startNodeX`.
- [Multi-select stale closure]: Pass `getMultiSel` callback to `useDrag`, not the Set — Set captured at `useCallback` time is stale by `dragEnd`.
