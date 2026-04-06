# Flow

Top-level document model, tab management, sharing, and persistence entry point.

## Flow
A **Flow** is the top-level document in Fit4Me — a named flowchart containing a [[tree#Tree]], optional [[edges#Cross-Edge]]s, optional [[retention#Retention]] data, and a `savedAt` timestamp. Users can have multiple flows open simultaneously; the active flow is tracked in [[store#Store]] via `activeId`.

Source: `src/types.ts` — `Flow` interface  
Source: `src/store.ts` — `flows`, `activeId`, `getActive()`

## Flow Tabs
The left sidebar lists all flows and lets users switch, rename, create, and delete them.

Users can create a new blank flow or paste an indented outline to generate one — see [[outline#Outline Parser]]. A minimum of one flow must always remain. Renaming: double-click or `Enter`. Delete: trash icon.

Source: `src/components/FlowTabs.tsx`

## Flow Persistence
Flows are saved in two places simultaneously — see [[storage#Storage]] for full details.

- **Local**: `localStorage` key `fit4me_flows_v1` — written on every change
- **Cloud**: Supabase table `flowchart_trees` — debounced 2s after each change

On app mount, cloud data is loaded first. On tab close, pending saves are flushed.

## Flow Sharing
A flow can be shared via URL hash. `encodeFlow` serialises it to base64; `decodeSharedFlow` parses `#share=…` on load and imports it as a new flow.

Source: `src/utils.ts` — `decodeSharedFlow`  
Source: `src/App.tsx` — shared flow import effect
