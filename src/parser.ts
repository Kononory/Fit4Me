import type { TreeNode, NodeType, BranchId } from './types';

// ── ID generation ─────────────────────────────────────────────────────────────

function slugify(text: string, used: Set<string>): string {
  let base = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'node';

  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

// ── Line parser ───────────────────────────────────────────────────────────────
// Format: "Label [type:branch] | sublabel"
// Examples:
//   Fit4Me [root]
//   Primary nav bar [nav] | Plan · Workouts · Fasting
//   Plan [tab:plan]
//   AI assistant block | ask your coach
//   Overview

interface ParsedLine {
  label: string;
  sublabel?: string;
  type?: NodeType;
  branch?: BranchId;
}

function parseLine(raw: string): ParsedLine {
  let text = raw.trim();

  // Extract "| sublabel" suffix
  let sublabel: string | undefined;
  const pipeIdx = text.indexOf(' | ');
  if (pipeIdx !== -1) {
    sublabel = text.slice(pipeIdx + 3).trim() || undefined;
    text = text.slice(0, pipeIdx).trim();
  }

  // Extract "[type]" or "[type:branch]" suffix
  let type: NodeType | undefined;
  let branch: BranchId | undefined;
  const bracketMatch = text.match(/\[([^\]]+)\]\s*$/);
  if (bracketMatch) {
    text = text.slice(0, bracketMatch.index).trim();
    const parts = bracketMatch[1].split(':');
    const t = parts[0].trim();
    if (t === 'root' || t === 'nav' || t === 'tab') type = t as NodeType;
    if (parts[1]) branch = parts[1].trim();
  }

  return { label: text || 'Untitled', sublabel, type, branch };
}

// ── Main export ───────────────────────────────────────────────────────────────

/** Parse an indented outline text into a TreeNode hierarchy. */
export function parseOutline(text: string): TreeNode {
  const lines = text.split('\n').filter(l => l.trim() !== '');
  const usedIds = new Set<string>();

  // Stack tracks the last node seen at each indent level
  const stack: Array<{ level: number; node: TreeNode }> = [];
  let root: TreeNode | null = null;

  for (const line of lines) {
    const spaces = (line.match(/^ */)?.[0] ?? '').length;
    const level  = Math.floor(spaces / 2);
    const { label, sublabel, type, branch } = parseLine(line);

    const node: TreeNode = {
      id: slugify(label, usedIds),
      label,
      ...(sublabel ? { sublabel } : {}),
      ...(type     ? { type }     : {}),
      ...(branch   ? { b: branch }: {}),
    };

    if (level === 0 || stack.length === 0) {
      root = node;
      stack.length = 0;
      stack.push({ level: 0, node });
    } else {
      // Pop until we find a node at a shallower level
      while (stack.length > 1 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      const parent = stack[stack.length - 1].node;
      if (!parent.c) parent.c = [];
      parent.c.push(node);
      stack.push({ level, node });
    }
  }

  const finalRoot = root ?? { id: 'root', label: 'New Flow', type: 'root' };
  // Propagate branch IDs from parents to children (so selection highlighting works)
  const propagateBranch = (node: TreeNode, parentBranch?: BranchId) => {
    if (!node.b && parentBranch) node.b = parentBranch;
    const branch = node.b;
    for (const child of node.c ?? []) propagateBranch(child, branch);
  };
  propagateBranch(finalRoot);
  return finalRoot;
}

/** Serialise a tree back to outline text (for export/download). */
export function treeToOutline(node: TreeNode, depth = 0): string {
  const indent = '  '.repeat(depth);
  let tag = '';
  if (node.type === 'root') tag = ' [root]';
  else if (node.type === 'nav') tag = ' [nav]';
  else if (node.type === 'tab') tag = node.b ? ` [tab:${node.b}]` : ' [tab]';
  const sub = node.sublabel ? ` | ${node.sublabel}` : '';
  const line = `${indent}${node.label}${tag}${sub}`;
  const children = (node.c ?? []).map(c => treeToOutline(c, depth + 1)).join('\n');
  return children ? `${line}\n${children}` : line;
}

/** Generate a blank starter outline for "New flow". */
export const BLANK_OUTLINE = `New Flow [root]
  Navigation [nav] | Tab 1 · Tab 2
    Tab 1 [tab:tab1]
      Screen A
      Screen B | optional subtitle
    Tab 2 [tab:tab2]
      Screen C
      Screen D`;
