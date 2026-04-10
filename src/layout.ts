import type { TreeNode, CrossEdge } from './types';

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

/** Canvas size based on tree dimensions (accounts for free-positioned nodes). */
export function canvasSize(allNodes: TreeNode[]): { cw: number; ch: number } {
  const maxX  = Math.max(...allNodes.map(n => (n.x ?? 0)));
  const maxCY = Math.max(...allNodes.map(n => centerY(n)));
  return {
    cw: maxX  + NW  + PAD * 2,
    ch: maxCY + NH / 2 + PAD * 2,
  };
}

/** Center Y of a node (respects free py override). */
export const centerY = (n: TreeNode): number =>
  n.py !== undefined ? n.py : PAD + (n.row ?? 0) * RH + RH / 2;

/** Top Y of a node element. */
export const topY = (n: TreeNode): number => centerY(n) - NH / 2;

// ── Overlap detection ──────────────────────────────────────────────────────────

export interface Overlap {
  a: [TreeNode, TreeNode];
  b: [TreeNode, TreeNode];
  ix: number;
  iy: number;
}

/** Segment intersection test (cross-product). Returns intersection point or null. */
function segIntersect(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): { x: number; y: number } | null {
  const dx1 = bx - ax, dy1 = by - ay;
  const dx2 = dx - cx, dy2 = dy - cy;
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-10) return null; // parallel
  const t = ((cx - ax) * dy2 - (cy - ay) * dx2) / denom;
  const u = ((cx - ax) * dy1 - (cy - ay) * dx1) / denom;
  if (t > 0 && t < 1 && u > 0 && u < 1) {
    return { x: ax + t * dx1, y: ay + t * dy1 };
  }
  return null;
}

type Seg = { x1: number; y1: number; x2: number; y2: number };

function edgeSeg(from: TreeNode, to: TreeNode): Seg {
  return {
    x1: (from.x ?? 0) + NW,
    y1: centerY(from),
    x2: to.x ?? 0,
    y2: centerY(to),
  };
}

function crossEdgeSeg(
  fromNode: TreeNode | undefined,
  toNode: TreeNode | undefined,
): Seg | null {
  if (!fromNode || !toNode) return null;
  return {
    x1: (fromNode.x ?? 0) + NW / 2,
    y1: centerY(fromNode),
    x2: (toNode.x ?? 0) + NW / 2,
    y2: centerY(toNode),
  };
}

/**
 * Detect all pairs of edges (tree + cross) whose line segments intersect.
 * Shared-endpoint pairs are skipped (siblings naturally meet at parent).
 */
export function detectOverlaps(
  allEdges: [TreeNode, TreeNode][],
  crossEdges: CrossEdge[],
  allNodes: TreeNode[],
): Overlap[] {
  const nodeById = new Map(allNodes.map(n => [n.id, n]));

  // Build unified segment list: { seg, edge, key }
  type EdgeEntry = { seg: Seg; from: TreeNode; to: TreeNode };
  const entries: EdgeEntry[] = [];

  for (const [from, to] of allEdges) {
    entries.push({ seg: edgeSeg(from, to), from, to });
  }
  for (const ce of crossEdges) {
    const from = nodeById.get(ce.fromId);
    const to   = nodeById.get(ce.toId);
    const seg  = crossEdgeSeg(from, to);
    if (seg && from && to) entries.push({ seg, from, to });
  }

  const overlaps: Overlap[] = [];
  for (let i = 0; i < entries.length; i++) {
    const a = entries[i];
    for (let j = i + 1; j < entries.length; j++) {
      const b = entries[j];
      // Skip pairs that share an endpoint node (natural adjacency)
      if (a.from.id === b.from.id || a.from.id === b.to.id ||
          a.to.id   === b.from.id || a.to.id   === b.to.id) continue;
      const pt = segIntersect(
        a.seg.x1, a.seg.y1, a.seg.x2, a.seg.y2,
        b.seg.x1, b.seg.y1, b.seg.x2, b.seg.y2,
      );
      if (pt) {
        overlaps.push({ a: [a.from, a.to], b: [b.from, b.to], ix: pt.x, iy: pt.y });
      }
    }
  }
  return overlaps;
}

/**
 * Clear all free positions and re-run layout — produces an overlap-free arrangement.
 * Caller must call doLayout() + applyFreePositions() after this.
 */
export function autoArrange(root: TreeNode): void {
  flattenTree(root).forEach(n => { delete n.px; delete n.py; });
  doLayout(root, 0, 0);
}
