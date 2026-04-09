import { useRef, useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import type { TreeNode } from '../types';
import { cloneTree } from '../tree';
import { doLayout, flattenTree, collectEdges, canvasSize, NW, NH, topY } from '../layout';
import { EdgeLayer } from './EdgeLayer';

interface Props {
  node: TreeNode;
  onClose: () => void;
}

/** Self-contained mini canvas showing the subtree of a single node */
function SubFlow({ root }: { root: TreeNode }) {
  const cnvRef = useRef<HTMLDivElement>(null);
  const [selId, setSelId] = useState<string | null>(null);

  const { nodes, edges } = useMemo(() => {
    const cloned = cloneTree(root);
    doLayout(cloned, 0, 0);
    return { nodes: flattenTree(cloned), edges: collectEdges(cloned) };
  }, [root]);

  const { cw, ch } = canvasSize(nodes);

  return (
    <div ref={cnvRef} style={{ position: 'relative', width: cw, height: ch }}>
      <EdgeLayer
        allNodes={nodes}
        allEdges={edges}
        crossEdges={[]}
        width={cw}
        height={ch}
        doAnim={false}
        sel={null}
        selNodeId={selId}
        selTick={0}
        cnvRef={cnvRef}
        onShowEdgePicker={() => {}}
        onShowCrossEdgePicker={() => {}}
      />
      {nodes.map(n => (
        <div
          key={n.id}
          className={`nd${selId === n.id ? ' s-active' : ''}`}
          style={{ left: n.x, top: topY(n), width: NW, height: NH, position: 'absolute', cursor: 'pointer' }}
          onClick={() => setSelId(selId === n.id ? null : n.id)}
        >
          <span className="nd-lbl">{n.label}</span>
          {n.sublabel && <span className="sub">{n.sublabel}</span>}
        </div>
      ))}
    </div>
  );
}

export function ExpandedNode({ node, onClose }: Props) {
  return (
    <>
      {/* Blurred backdrop — click collapses */}
      <motion.div
        className="en-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
      />

      {/* Full-screen panel — morphs from compact node via layoutId FLIP */}
      <motion.div
        layoutId={`node-morph-${node.id}`}
        className="en-panel"
      >
        <div className="en-header">
          <span className="en-title">{node.label}</span>
          <button className="en-close" onClick={onClose}><X size={13} /></button>
        </div>

        {/* Flow canvas fades in after the morph animation settles */}
        <motion.div
          className="en-flow-wrap"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ delay: 0.15, duration: 0.18 }}
        >
          <SubFlow root={node} />
        </motion.div>
      </motion.div>
    </>
  );
}
