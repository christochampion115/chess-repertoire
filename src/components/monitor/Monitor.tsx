import React, { useEffect, useMemo, useState } from 'react';
import { useRepertoireStore } from '@/stores/repertoireStore';
import { getMovePath, getNode } from '@/services/repertoire';
import { ensureOpeningsLoaded, lookupEcoEntry } from '@/services/openings';
import { ANNOTATION_STYLE } from '@/utils/annotationStyle';

/**
 * PGN / move list + current node comment + opening info.
 *
 * Remonte la chaîne parentId via getMovePath() (O(profondeur)) au lieu d'un DFS O(n).
 */
export const Monitor = React.memo(function Monitor() {
  const currentNodeId  = useRepertoireStore((s) => s.currentNodeId);
  const version        = useRepertoireStore((s) => s.version);
  const [openingsReady, setOpeningsReady] = useState(false);

  useEffect(() => {
    ensureOpeningsLoaded().then(() => setOpeningsReady(true));
  }, []);

  const { moveHistory, currentNode } = useMemo(() => {
    void version;
    void openingsReady;
    if (!currentNodeId) return { moveHistory: [], currentNode: null };
    const path = getMovePath(currentNodeId);
    const last = getNode(currentNodeId) ?? null;
    return { moveHistory: path, currentNode: last?.parentId !== null ? last : null };
  }, [currentNodeId, version, openingsReady]);

  const openingEntry = useMemo(() => {
    const sans = moveHistory.map((n) => n.san);
    return lookupEcoEntry(sans);
  }, [moveHistory, openingsReady]);

  const comment = currentNode?.comment ?? '';

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

      {/* Node comment + opening — div.monitor-comment */}
      <div className="monitor-comment" id="mon-comment">
        {comment && <div className="monitor-comment-text">{comment}</div>}
        {openingEntry && (
          <div className="opening-info">
            <span className="opening-info-eco">{openingEntry.eco}</span>
            <span className="opening-info-name">{openingEntry.name}</span>
          </div>
        )}
      </div>
    </>
  );
});
