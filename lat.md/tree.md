# Tree

TreeNode data structure, node types, branch IDs, and all tree mutation operations.

## Tree
Each [[flow#Flow]] contains a single **Tree** — a recursive `TreeNode` rooted at one node of `type: 'root'`. Children are in `c: TreeNode[]`. All tree mutations live in `src/tree.ts`; always call `pushUndo()` before mutating, then `updateActiveTree()`.

Source: `src/types.ts` — `TreeNode`  
Source: `src/tree.ts` — all tree operations

## Node Types
Every node has an optional `type` field that controls rendering and behaviour.

| Type | Role |
|------|------|
| `root` | Top-level app node — one per tree |
| `nav` | Navigation bar — renders branch tabs |
| `tab` | Tab within a nav — groups its subtree into a branch |
| `leaf` | (default) Content screen / step |

## Branch ID
`b: BranchId` marks which branch a node belongs to. Set on `tab` nodes; propagated to all descendants by [[outline#Outline Parser]] after parsing. Controls branch highlight and selection dimming on the [[canvas#Canvas]].

## Node Fields
Key fields on `TreeNode` beyond `id`, `label`, `type`, and `b`.

| Field | Purpose |
|-------|---------|
| `sublabel` | Secondary text (smaller, muted) |
| `edgeLabel` | Label shown on the incoming branch line |
| `edgeStatus` | `up/down/ok/warn` icon on the incoming line |
| `edgeRetention` | Per-edge [[retention#Retention]] analytics |

Layout fields (`depth`, `row`, `x`) are computed by [[layout#Layout]] and **never serialised**.

## Tree Operations
All mutations in `src/tree.ts`: `findNode`, `addChildNode`, `removeNode`, `reparentNode` (cycle-guarded), `swapNodes` (guards root/nav), `cloneTree` (strips layout coords).
