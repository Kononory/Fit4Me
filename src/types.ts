export type NodeType = 'root' | 'nav' | 'tab' | 'leaf';
export type FlowShape = 'rect' | 'stadium' | 'diamond' | 'circle' | 'parallelogram';
export type BranchId = string; // open-ended so imported flows can use any branch name

export interface TreeNode {
  id: string;
  label: string;
  sublabel?: string;
  edgeLabel?: string;   // label shown on the incoming branch line
  edgeStatus?: 'up' | 'down' | 'ok' | 'warn'; // status icon on the incoming branch line
  edgeRetention?: RetentionPoint[]; // analytics data on the incoming branch line
  type?: NodeType;
  b?: BranchId;
  c?: TreeNode[];
  // Layout (computed, not serialised)
  depth?: number;
  row?: number;
  x?: number;
  // Free positioning (serialised, override auto-layout)
  px?: number; // free x (pixel left)
  py?: number; // free y (pixel center)
  // Figma link (serialised) — format: `${fileKey}||${nodeId}`
  figmaRef?: string;
  // Rich notes shown in the expanded panel card body
  content?: string;
  // Independent mini-flowchart owned by this node (edited in the expanded panel)
  innerFlow?: TreeNode;
  // Shape of the node in the inner SubFlow
  shape?: FlowShape;
}

export interface CrossEdge {
  id: string;
  fromId: string;   // source node id
  toId: string;     // target node id
  label?: string;
  type: 'back' | 'ref'; // back=return arrow, ref=cross-reference
}

export interface EventEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  buttonLabel: string;
  eventName: string;   // e.g. "tap", "swipe", "long press"
  bx: number;          // hotspot x within source card image (0–1)
  by: number;          // hotspot y within source card image (0–1)
}

export interface Flow {
  id: string;
  name: string;
  tree: TreeNode;
  crossEdges?: CrossEdge[];
  retentionData?: RetentionPoint[]; // custom per-flow retention chart data
  eventEdges?: EventEdge[];
  eventPositions?: Record<string, { x: number; y: number }>; // free card positions in events map
  savedAt?: string;
}

export interface FlowMeta {
  id: string;
  name: string;
  savedAt?: string;
}

export interface RetentionPoint {
  pct: number;
  s: string;
}

export type SelectionState = 'act' | 'dim' | 'par' | 'def';

export interface DragState {
  node: TreeNode | null;
  el: HTMLElement | null;
  ghost: HTMLElement | null;
  target: TreeNode | null;
  sx: number; sy: number;
  cx: number; cy: number;   // current cursor in canvas coords (connect mode)
  on: boolean;
  mode: 'swap' | 'connect';
}

export interface SavePayload {
  tree: TreeNode;
  savedAt: string;
}
