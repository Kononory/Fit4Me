import type { TreeNode } from './types';

export const NW  = 156; // node width
export const NH  = 36;  // node height
export const LW  = 184; // level width (horizontal spacing)
export const RH  = 40;  // row height (vertical spacing)
export const PAD = 40;  // canvas padding

/** Recursively assign depth, x, and row to every node. Returns row count. */
export function doLayout(n: TreeNode, depth: number, startRow: number): number {
  n.depth = depth;
  n.x = PAD + depth * LW;

  if (!n.c || n.c.length === 0) {
    n.row = startRow;
    return 1;
  }

  let currentRow = startRow;
  let total = 0;
  for (const child of n.c) {
    const size = doLayout(child, depth + 1, currentRow);
    currentRow += size;
    total += size;
  }
  n.row = (n.c[0].row! + n.c[n.c.length - 1].row!) / 2;
  return total;
}

/** Flatten tree to array (depth-first). */
export function flattenTree(n: TreeNode, acc: TreeNode[] = []): TreeNode[] {
  acc.push(n);
  (n.c ?? []).forEach(c => flattenTree(c, acc));
  return acc;
}

/** Collect all [parent, child] pairs. */
export function collectEdges(n: TreeNode, acc: [TreeNode, TreeNode][] = []): [TreeNode, TreeNode][] {
  (n.c ?? []).forEach(c => { acc.push([n, c]); collectEdges(c, acc); });
  return acc;
}

/** Canvas size based on tree dimensions. */
export function canvasSize(allNodes: TreeNode[]): { cw: number; ch: number } {
  const maxDepth = Math.max(...allNodes.map(n => n.depth ?? 0));
  const maxRow   = Math.max(...allNodes.map(n => n.row   ?? 0));
  return {
    cw: PAD * 2 + maxDepth * LW + NW,
    ch: PAD * 2 + (maxRow + 1) * RH,
  };
}

/** Center Y of a node. */
export const centerY = (n: TreeNode): number => PAD + (n.row ?? 0) * RH + RH / 2;

/** Top Y of a node element. */
export const topY = (n: TreeNode): number => centerY(n) - NH / 2;
