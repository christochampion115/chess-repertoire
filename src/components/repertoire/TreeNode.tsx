import React from 'react';
import type { RepertoireNode } from '@/types/repertoire';
import { ANNOTATION_STYLE } from '@/utils/annotationStyle';

export interface TreeNodeProps {
  node: RepertoireNode;
  /** Currently active node id (for highlighting). */
  currentNodeId: string | null;
  /** Which node ids are expanded. */
  expandedIds: Set<string>;
  onSelect: (node: RepertoireNode) => void;
  onContext: (e: React.MouseEvent, node: RepertoireNode) => void;
  onToggle: (nodeId: string) => void;
  /** Internal flag — hides the move number when chaining same-turn moves. */
  hideNum?: boolean;
}

/**
 * Recursive leaf component.
 *
 * Renders a single tree node (move text + toggle + inline chain) and recurses
 * for child branches.  Mirrors the structure from js/arbre.js:
 *   <li.tree-node>
 *     <div.tree-line>
 *       [tree-toggle]  move-text … [annotation-tag] [↪]  move-text …
 *     </div>
 *     <ul.tree-root>  ← sub-branches (when expanded & >1 children)
 *   </li>
 */
export const TreeNode = React.memo(function TreeNode({
  node,
  currentNodeId,
  expandedIds,
  onSelect,
  onContext,
  onToggle,
  hideNum = false,
}: TreeNodeProps) {
  const isActive  = node.id === currentNodeId;
  const isExpanded = expandedIds.has(node.id);

  // --- inline chain (single-child run, same as arbre.js "while" loop) ---
  const chainNodes: RepertoireNode[] = [];
  let chainCurrent: RepertoireNode = node;
  // Don't chain if node itself is a transposition
  if (!node.isTransposition) {
    while (chainCurrent.children.length === 1) {
      const next = chainCurrent.children[0]!;
      chainNodes.push(next);
      chainCurrent = next;
      if (next.isTransposition) break;
    }
  }
  const lastInChain = chainCurrent;

  // sub-branches rendered below the line
  const hasSubBranches =
    lastInChain.children.length > 1 ||
    (lastInChain.children.length === 1 && lastInChain.children[0]!.isTransposition) ||
    (lastInChain.isTransposition && lastInChain.children.length > 0);

  return (
    <li className="tree-node">
      <div className="tree-line">
        {/* Expand / collapse toggle — only show when this node has children */}
        {node.children.length > 0 && (
          <div
            className="tree-toggle"
            onClick={e => {
              e.stopPropagation();
              onToggle(node.id);
            }}
          >
            {isExpanded ? '–' : '+'}
          </div>
        )}

        {/* First move in chain */}
        <MoveText
          node={node}
          isActive={isActive}
          hideNum={hideNum}
          onSelect={onSelect}
          onContext={onContext}
        />

        {/* Inline chain of single-child moves */}
        {isExpanded &&
          chainNodes.map((chainNode, idx) => {
            const prev = idx === 0 ? node : chainNodes[idx - 1];
            const shouldHideNum = prev !== undefined && prev.turn === 'w' && chainNode.turn === 'b';
            return (
              <MoveText
                key={chainNode.id}
                node={chainNode}
                isActive={chainNode.id === currentNodeId}
                hideNum={shouldHideNum}
                onSelect={onSelect}
                onContext={onContext}
              />
            );
          })}
      </div>

      {/* Sub-branches */}
      {isExpanded && hasSubBranches && (
        <ul className="tree-root">
          {lastInChain.children.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              currentNodeId={currentNodeId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onContext={onContext}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
});

// ---------------------------------------------------------------------------
// Internal helper — not exported (leaf display only)
// ---------------------------------------------------------------------------

interface MoveTextProps {
  node: RepertoireNode;
  isActive: boolean;
  hideNum: boolean;
  onSelect: (node: RepertoireNode) => void;
  onContext: (e: React.MouseEvent, node: RepertoireNode) => void;
}

function MoveText({ node, isActive, hideNum, onSelect, onContext }: MoveTextProps) {
  return (
    <div
      className={`move-text${isActive ? ' active' : ''}`}
      onClick={e => {
        e.stopPropagation();
        onSelect(node);
      }}
      onContextMenu={e => {
        e.preventDefault();
        e.stopPropagation();
        onContext(e, node);
      }}
    >
      {!hideNum && (
        <>
          <span className="move-num">
            {node.turn === 'w' ? `${node.moveNum}.` : `${node.moveNum}...`}
          </span>
          {' '}
        </>
      )}
      {node.san}
      {node.annotation && (
        <span className="annotation-tag" style={{ color: ANNOTATION_STYLE[node.annotation]?.color }}>{node.annotation}</span>
      )}
      {node.isTransposition && ' ↪'}
    </div>
  );
}
