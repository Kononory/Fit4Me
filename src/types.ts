export type NodeType = 'root' | 'nav' | 'tab' | 'leaf';
export type BranchId = string; // open-ended so imported flows can use any branch name

export interface TreeNode {
  id: string;
  label: string;
  sublabel?: string;
  edgeLabel?: string;   // label shown on the incoming branch line
  edgeStatus?: 'up' | 'down' | 'ok' | 'warn'; // status icon on the incoming branch line
  type?: NodeType;
  b?: BranchId;
  c?: TreeNode[];
  // Layout (computed, not serialised)
  depth?: number;
  row?: number;
  x?: number;
}

export interface Flow {
  id: string;
  name: string;
  tree: TreeNode;
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
