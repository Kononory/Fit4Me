import { motion } from 'motion/react';
import { X, ChevronRight } from 'lucide-react';
import type { TreeNode } from '../types';

interface Props {
  node: TreeNode;
  onClose: () => void;
}

export function ExpandedNode({ node, onClose }: Props) {
  return (
    <>
      {/* Dimming backdrop — click to collapse */}
      <motion.div
        className="en-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />

      {/* Centering wrapper — pointer-events:none so backdrop click passes through */}
      <div className="en-outer">
        <motion.div
          layoutId={`node-morph-${node.id}`}
          className="en-card"
        >
          <button className="en-close" onClick={onClose}><X size={13} /></button>

          {/* Inner content fades in after the morph finishes */}
          <motion.div
            className="en-content"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ delay: 0.15, duration: 0.18, ease: 'easeOut' }}
          >
            <div className="en-label">{node.label}</div>
            {node.sublabel && <div className="en-sublabel">{node.sublabel}</div>}
            {node.c && node.c.length > 0 && (
              <ul className="en-children">
                {node.c.map(child => (
                  <li key={child.id} className="en-child">
                    <ChevronRight size={10} className="en-child-arrow" />
                    <span>{child.label}</span>
                    {child.sublabel && <span className="en-child-sub">{child.sublabel}</span>}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </motion.div>
      </div>
    </>
  );
}
