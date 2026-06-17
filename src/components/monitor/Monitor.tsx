import React, { useMemo } from 'react';
import { useRepertoireStore } from '@/stores/repertoireStore';
import { getMovePath, getNode } from '@/services/repertoire';
import { ANNOTATION_STYLE } from '@/utils/annotationStyle';

/**
 * PGN / move list + current node comment.
 *
 * Remonte la chaîne parentId via getMovePath() (O(profondeur)) au lieu d'un DFS O(n).
 */
export const Monitor = React.memo(function Monitor() {
  const currentNodeId  = useRepertoireStore((s) => s.currentNodeId);
  const version        = useRepertoireStore((s) => s.version);

  const { moveHistory, currentNode } = useMemo(() => {
    void version;
    if (!currentNodeId) return { moveHistory: [], currentNode: null };
    const path = getMovePath(currentNodeId);
    const last = getNode(currentNodeId) ?? null;
    return { moveHistory: path, currentNode: last?.parentId !== null ? last : null };
  }, [currentNodeId, version]);

  return (
    <>
      <div className="monitor-pgn" id="mon-pgn">
        {moveHistory.length === 0 ? (
          <span className="monitor-empty">Position de départ</span>
        ) : (
          moveHistory.map((node) => (
            <React.Fragment key={node.id}>
              {node.turn === 'w' && (
                <span className="monitor-movenum">{node.moveNum}.{' '}</span>
              )}
              <span className="monitor-san">
                {node.san}
                {node.annotation && (
                  <span className="annotation-tag" style={{ color: ANNOTATION_STYLE[node.annotation]?.color }}>{node.annotation}</span>
                )}
                {' '}
              </span>
            </React.Fragment>
          ))
        )}
      </div>

      {/* Node comment (if any) — div.monitor-comment */}
      <div className="monitor-comment" id="mon-comment">
        {currentNode?.comment ?? ''}
      </div>
    </>
  );
});
