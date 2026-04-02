export type NodeType = 'root' | 'nav' | 'tab' | 'leaf';
export type BranchId = 'plan' | 'workouts' | 'secondary' | 'me' | 'more' | 'fasting';

export interface TreeNode {
  id: string;
  label: string;
  sublabel?: string;
  type?: NodeType;
  b?: BranchId;
  c?: TreeNode[];
  // Layout (computed, not serialised)
  depth?: number;
  row?: number;
  x?: number;
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
  sx: number;
  sy: number;
  on: boolean;
}

export interface SavePayload {
  tree: TreeNode;
  savedAt: string;
}
