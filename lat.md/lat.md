This directory defines the high-level concepts, business logic, and architecture of this project using markdown. It is managed by [lat.md](https://www.npmjs.com/package/lat.md) — a tool that anchors source code to these definitions. Install the `lat` command with `npm i -g lat.md` and run `lat --help`.

- [[flow]] — Flow document, tabs, sharing, persistence entry point
- [[tree]] — TreeNode structure, node types, branch IDs, tree operations
- [[layout]] — Layout algorithm and pixel constants (NW, NH, LW, RH, PAD)
- [[outline]] — Indented text outline parser and editor panel
- [[edges]] — Tree edge layer, cross-edges, edge picker UI
- [[canvas]] — Canvas rendering, node display, drag-and-drop, viewport
- [[storage]] — Dual-layer persistence (localStorage + Supabase cloud)
- [[store]] — Zustand global state, undo/redo, cloud save scheduling
- [[retention]] — Retention funnel widget, hotkeys panel
