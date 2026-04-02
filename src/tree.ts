import type { TreeNode } from './types';

interface ParentRef {
  parent: TreeNode;
  index: number;
}

/** Find the parent node and index of a given node id. */
export function findParent(root: TreeNode, id: string): ParentRef | null {
  if (!root.c) return null;
  for (let i = 0; i < root.c.length; i++) {
    if (root.c[i].id === id) return { parent: root, index: i };
    const found = findParent(root.c[i], id);
    if (found) return found;
  }
  return null;
}

/** Swap two sibling-or-cousin nodes in the tree. */
export function swapNodes(root: TreeNode, a: TreeNode, b: TreeNode): boolean {
  if (a.type === 'root' || a.type === 'nav') return false;
  if (b.type === 'root' || b.type === 'nav') return false;

  const fa = findParent(root, a.id);
  const fb = findParent(root, b.id);
  if (!fa || !fb) return false;

  fa.parent.c![fa.index] = b;
  fb.parent.c![fb.index] = a;
  return true;
}

/** Deep-clone a tree node (strips layout coords). */
export function cloneTree(n: TreeNode): TreeNode {
  const { depth: _d, row: _r, x: _x, ...rest } = n;
  return {
    ...rest,
    c: rest.c ? rest.c.map(cloneTree) : undefined,
  };
}

/** Deep-clone a tree, keeping layout coords intact (for serialisation). */
export function serializeTree(n: TreeNode): TreeNode {
  return cloneTree(n);
}
