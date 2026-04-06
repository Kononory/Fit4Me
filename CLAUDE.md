# Fit4Me — Claude Code Rules

## Project
Fit4Me is a canvas-based flowchart / mind-map tool built for personal productivity. Users create multi-tab flows of tree-structured nodes, edit them via an indented text outline, connect nodes with typed edges, and persist everything to Supabase. An Anthropic AI integration assists with node content. Deployed on Vercel.

## Stack
- React 19 + TypeScript, Vite 5, Tailwind CSS 4, Zustand 5
- Font: `LatteraMonoLL` / `Space Mono` (monospace everywhere)
- No external component libraries — all UI is hand-crafted

## Storage pattern
- **Local** (`localStorage`) — written on every change, instant, machine-specific
- **Cloud** (Supabase via `/api/*`) — debounced 2s after each change via `scheduleCloudSave()` in `store.ts`
- **Load order** — app mount calls `loadFlowsRemote()` first; cloud wins over localStorage
- **Tab close** — `flushCloudSaves()` fires all pending debounced saves on `beforeunload`
- Never call `saveFlowRemote` directly for auto-saves — always go through `scheduleCloudSave(flow)`

## Repo layout
```
src/
  components/   # UI — Canvas, NodeEl, EdgeLayer, EdgePicker, TextEditPanel, FlowTabs, Toolbar, RetentionWidget, Viewport
  store.ts      # Zustand global state (flows, selection, undo/redo, drag, UI flags)
  types.ts      # TreeNode, Flow, CrossEdge, DragState
  parser.ts     # parseOutline() / treeToOutline() — indented text ↔ tree
  layout.ts     # doLayout(), flattenTree(), canvasSize() — NW=156 NH=36 LW=184 RH=40 PAD=40
  tree.ts       # findNode, addChildNode, removeNode, reparentNode, swapNodes, cloneTree
  data.ts       # DEFAULT_TREE
  storage.ts    # local + Supabase persistence
  style.css     # all styles (no CSS modules) — read this before adding classes
```

## CSS conventions
- All styles in `src/style.css` — no separate files, no CSS modules
- ID-based for unique elements (`#text-edit-panel`), class-based for reusable (`.te-btn`)
- Prefix classes by component: `nd-` nodes, `ep-` edge picker, `te-` text edit, `ft-` flow tabs, `ea-` edge analytics, `ret-` retention
- Z-index ladder: 500 modals → 100 sidebar → 90 pickers → 60 ret-marker → 40 text-edit → 20 handles → 6 drag → 2 nodes → 1 edges
- Color palette: bg `#FEFCF8`/`#F8F7F4`/`#F2F1ED`, text `#1A1A1A`, muted `#AEADA8`/`#9A9995`, border `#DEDDDA`/`#E2E1DC`, red `#B52B1E`, green `#6B9B5E`, orange `#C8963C`

## State patterns
- Global toggles (e.g. `textEditOpen`) live in `store.ts`
- Component-local UI state uses `useState` — don't pollute the store
- Toggle modals: `useState<'mode-a'|'mode-b'|null>` pattern (see FlowTabs)
- Undo: always call `pushUndo()` before `updateActiveTree()`

## Git
- Active dev branch: `claude/add-text-steps-display-MPzeW`
- Push with: `git push -u origin <branch>`

## Token efficiency report (on every new feature task)
At the start of each implementation plan, include a one-line estimate:
> **Token cost w/ CLAUDE.md:** ~X k | **Without:** ~Y k | **Saved:** ~Z k

Count saved tokens from skipped work:
- No Explore agent (~8–15 k) — stack/layout/CSS already known
- No full style.css read (~3 k) — conventions documented above
- No store.ts read (~2 k) — state patterns documented above
- No multi-file grep for conventions (~2–5 k) — prefixes/z-index/colors listed above
- Shorter plan (~1–2 k) — no need to explain the project to yourself

## Post-iteration rule update (mandatory)
After every completed feature, bugfix, or refactor — before closing the task — do the following:

1. **Add any new pattern** discovered during the iteration to the relevant section above (CSS, state, repo layout, etc.)
2. **Document errors encountered** and how they were resolved, as a rule to prevent recurrence:
   - Format: `- [Error type]: [root cause] → [fix]`
   - Add under a `## Known pitfalls` section (create if missing)
3. **Update token estimates** if new files or patterns were read that should be pre-documented
4. **Commit the updated CLAUDE.md** alongside the feature commit — never separately

This keeps CLAUDE.md as a living document and prevents repeating the same mistakes.

## What NOT to do
- Don't add docstrings/comments to unchanged code
- Don't create helper abstractions for one-off logic
- Don't add error handling for impossible states
- Don't launch Explore/Plan agents for targeted searches — use Grep/Glob directly
- Don't read files you don't need to modify
- Don't use Bash for file reads/searches — use Read/Grep/Glob tools
