# Storage

Dual-layer persistence: synchronous localStorage and debounced Supabase cloud sync.

## Storage
Dual-layer persistence — every change is written to both localStorage and Supabase. Cloud writes are debounced to avoid excessive API calls. On mount, cloud data takes priority over local.

Source: `src/storage.ts`  
Source: `src/store.ts` — `scheduleCloudSave`, `flushCloudSaves`

## Local Storage
Synchronous, written on every state mutation. Machine/browser-specific — lost on a new device or if localStorage is cleared.

- Key `fit4me_flows_v1` — all flows as JSON
- Key `fit4me_active_v1` — active flow id
- Written via `saveFlowsLocal` inside [[store#Store]] mutations

## Cloud Storage
Async, debounced. Survives across devices and browsers. Backend is Supabase via Vercel serverless functions.

- Table: `flowchart_trees` in Supabase
- Routes: `/api/save`, `/api/load`, `/api/delete`, `/api/flows`
- Written via `scheduleCloudSave(flow)` only — never call `saveFlowRemote` directly for auto-saves
- Debounce: 2 seconds after each change
- On `beforeunload`: `flushCloudSaves()` fires all pending timers immediately

## Load Priority
On app mount, `loadFlowsRemote()` is called. If cloud returns data, it replaces localStorage. Fallback chain: **Cloud → localStorage → default flow**.
