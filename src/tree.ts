import type { TreeNode } from './types';

export function findNode(root: TreeNode, id: string): TreeNode | null {
  if (root.id === id) return root;
  for (const c of root.c ?? []) {
    const f = findNode(c, id);
    if (f) return f;
  }
  return null;
}

export function addChildNode(parent: TreeNode): TreeNode {
  let b = parent.b;
  if (!b) {
    // Auto-assign next available branch letter to direct children of root-like nodes
    const used = new Set((parent.c ?? []).map(n => n.b).filter(Boolean) as string[]);
    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      if (!used.has(letter)) { b = letter; break; }
    }
  }
  const node: TreeNode = { id: `n-${Date.now()}`, label: 'New Block', b };
  if (!parent.c) parent.c = [];
  parent.c.push(node);
  return node;
}

export function removeNode(root: TreeNode, nodeId: string): boolean {
  if (!root.c) return false;
  const i = root.c.findIndex(c => c.id === nodeId);
  if (i !== -1) { root.c.splice(i, 1); if (!root.c.length) delete root.c; return true; }
  return root.c.some(c => removeNode(c, nodeId));
}

export function reparentNode(root: TreeNode, nodeId: string, newParentId: string): boolean {
  if (nodeId === newParentId) return false;
  const mover = findNode(root, nodeId);
  if (!mover) return false;
  if (findNode(mover, newParentId)) return false; // would create cycle
  let detached: TreeNode | null = null;
  const detach = (n: TreeNode): boolean => {
    if (!n.c) return false;
    const i = n.c.findIndex(c => c.id === nodeId);
    if (i !== -1) { [detached] = n.c.splice(i, 1); if (!n.c.length) delete n.c; return true; }
    return n.c.some(c => detach(c));
  };
  if (!detach(root) || !detached) return false;
  const newParent = findNode(root, newParentId);
  if (!newParent) return false;
  if (!newParent.c) newParent.c = [];
  newParent.c.push(detached);
  return true;
}

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

/** Add a new sibling node immediately after the given node. Returns the new node or null if nodeId is root. */
export function addSiblingNode(root: TreeNode, nodeId: string): TreeNode | null {
  const ref = findParent(root, nodeId);
  if (!ref) return null;
  const { parent, index } = ref;
  const b = parent.c![index].b;
  const node: TreeNode = { id: `n-${Date.now()}`, label: 'New Block', b };
  parent.c!.splice(index + 1, 0, node);
  return node;
}

/** Swap only the label/sublabel of two nodes, keeping each node's children in place. */
export function swapNodeMetadata(root: TreeNode, aId: string, bId: string): boolean {
  const a = findNode(root, aId);
  const b = findNode(root, bId);
  if (!a || !b) return false;
  if (a.type === 'root' || b.type === 'root') return false;
  const tmp = a.label; a.label = b.label; b.label = tmp;
  const tmpS = a.sublabel; a.sublabel = b.sublabel; b.sublabel = tmpS;
  return true;
}

/** Swap two sibling-or-cousin nodes in the tree (entire subtree moves). */
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
