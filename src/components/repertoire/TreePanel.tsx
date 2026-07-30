import React, { useCallback } from 'react';
import { useRepertoireStore } from '@/stores/repertoireStore';
import { TreeNode } from './TreeNode';
import type { RepertoireNode } from '@/types/repertoire';
import { buildContextMenu } from '@/services/contextMenu';
import * as repertoireService from '@/services/repertoire';

/**
 * Recursive move tree for the active repertoire.
 */
export const TreePanel = React.memo(function TreePanel() {
  const repertoires        = useRepertoireStore((s) => s.repertoires);
  const activeRepIndex     = useRepertoireStore((s) => s.activeRepIndex);
  const freePlayRoot       = useRepertoireStore((s) => s.freePlayRoot);
  const currentNodeId      = useRepertoireStore((s) => s.currentNodeId);
  const treeExpanded       = useRepertoireStore((s) => s.treeExpanded);

  const root: RepertoireNode | null | undefined =
    activeRepIndex >= 0 ? repertoires[activeRepIndex] : freePlayRoot;

  const handleSelect = useCallback(
    (node: RepertoireNode) => {
      repertoireService.navigateToNode(node.id);
    },
    [],
  );

  const handleContext = useCallback(
    (e: React.MouseEvent, node: RepertoireNode) => {
      buildContextMenu(e, 'arbre', node);
    },
    [],
  );

  if (!root) {
    return <div className="panel-empty">Aucun répertoire actif.</div>;
  }

  if (root.children.length === 0) {
    return <div className="panel-empty">Répertoire vide — ajoutez des coups.</div>;
  }

  return (
    <div className="tree-panel" id="arbre-panel" data-tutorial="tree-panel">
      <ul className="tree-root">
        {root.children.map((child) => (
          <TreeNode
            key={child.id}
            node={child}
            currentNodeId={currentNodeId}
            expandedIds={treeExpanded}
            onSelect={handleSelect}
            onContext={handleContext}
            onToggle={repertoireService.toggleTreeExpanded}
          />
        ))}
      </ul>
    </div>
  );
});
