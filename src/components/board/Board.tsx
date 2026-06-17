import React, { useMemo, useCallback } from 'react';
import { useChessStore } from '@/stores/chessStore';
import { useDragPiece } from '@/hooks/useDragPiece';
import { useBoardAnimation } from '@/hooks/useBoardAnimation';
import { Square as SquareCell } from './Square';
import { Piece as PieceComp } from './Piece';
import { DragGhost } from './DragGhost';
import { Chess } from 'chess.js';
import type { Square, Color, PieceType, ChessFile } from '@/types/chess';
import { buildContextMenu } from '@/services/contextMenu';
import * as repertoireService from '@/services/repertoire';
import { useRepertoireStore } from '@/stores/repertoireStore';
import { useTrainingStore } from '@/stores/trainingStore';

const FILES: ChessFile[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

type RawPiece = { color: Color; type: PieceType } | null;

interface SquareData {
  sq: Square;
  piece: RawPiece;
  fileIdx: number;
  rankIdx: number;
}

/**
 * Fully interactive 8×8 chessboard with drag-and-drop.
 */
export const Board = React.memo(function Board() {
  const chess          = useChessStore((s) => s.chess);
  const selectedSq     = useChessStore((s) => s.selectedSq);
  const boardFlipped   = useChessStore((s) => s.boardFlipped);
  const boardTheme     = useChessStore((s) => s.boardTheme);
  const currentNodeId  = useRepertoireStore((s) => s.currentNodeId);
  const repVersion     = useRepertoireStore((s) => s.version);
  const trainingPhase  = useTrainingStore((s) => s.phase);
  const trainingFeedback = useTrainingStore((s) => s.feedback);

  const { onPointerDown, activeDrag, dragTargetSq, legalTargetsDrag } = useDragPiece();
  useBoardAnimation();

  // Last move for highlighting — chess.load() clears history, so we derive
  // from the repertoire tree by replaying the current node's SAN on its parent FEN.
  const lastMove = useMemo<{ from: string; to: string } | null>(() => {
    void repVersion;
    if (!currentNodeId) return null;
    const node = repertoireService.getNode(currentNodeId);
    if (!node?.parentId || !node.san) return null;
    const parent = repertoireService.getNode(node.parentId);
    if (!parent?.fen) return null;
    try {
      const tmp = new Chess(parent.fen);
      const move = tmp.move(node.san);
      if (move) return { from: move.from, to: move.to };
      return null;
    } catch {
      return null;
    }
  }, [currentNodeId, repVersion]);

  // Annotation for the last-move destination square
  const annotationSym = useMemo<string | null>(() => {
    void repVersion;
    if (trainingPhase !== 'idle' || !currentNodeId) return null;
    const node = repertoireService.getNode(currentNodeId);
    return node?.annotation ?? null;
  }, [currentNodeId, trainingPhase, repVersion]);

  // Legal targets: use drag context if active, otherwise selection-based
  const legalTargets = useMemo<Set<string>>(() => {
    if (legalTargetsDrag) return legalTargetsDrag;
    if (!selectedSq) return new Set();
    const moves = chess.moves({ square: selectedSq, verbose: true });
    return new Set(moves.map((m) => m.to));
  }, [chess, selectedSq, legalTargetsDrag]);

  // Build the 64-square array in visual order (rank 8→1 / file a→h when not flipped)
  const squareData = useMemo<SquareData[]>(() => {
    const board = chess.board();
    const result: SquareData[] = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const rankIdx = boardFlipped ? row       : 7 - row;
        const fileIdx = boardFlipped ? 7 - col   : col;
        const file    = FILES[fileIdx] as ChessFile;
        const sq      = `${file}${rankIdx + 1}` as Square;
        const raw     = board[7 - rankIdx]?.[fileIdx] ?? null;
        const piece: RawPiece = raw
          ? { color: raw.color as Color, type: raw.type as PieceType }
          : null;
        result.push({ sq, piece, fileIdx, rankIdx });
      }
    }
    return result;
  }, [chess, boardFlipped]);

  const handleClick = useCallback(
    (sq: Square) => {
      repertoireService.handleSquareClick(sq);
    },
    [],
  );

  return (
    <div
      id="board"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        userSelect: 'none',
      }}
      onContextMenu={(e) => buildContextMenu(e, 'board')}
    >
      {squareData.map(({ sq, piece, fileIdx, rankIdx }) => {
        // a1 (fileIdx=0, rankIdx=0) is dark → odd sum = light
        const isLight      = (fileIdx + rankIdx) % 2 !== 0;
        const isSelected   = sq === selectedSq;
        const isLastMove   = lastMove != null &&
          (sq === (lastMove.from as string) || sq === (lastMove.to as string));
        const isTarget     = legalTargets.has(sq);
        const legalIndicator: 'dot' | 'ring' | null = isTarget
          ? (piece !== null ? 'ring' : 'dot')
          : null;

        return (
          <SquareCell
            key={sq}
            square={sq}
            isLight={isLight}
            theme={boardTheme}
            isSelected={isSelected}
            isLastMove={isLastMove}
            isDragTarget={sq === dragTargetSq}
            legalIndicator={legalIndicator}
            feedbackType={trainingFeedback && (sq === trainingFeedback.from || sq === trainingFeedback.to) ? trainingFeedback.type : null}
            isFeedbackSrc={trainingFeedback ? sq === trainingFeedback.from : false}
            annotationSym={sq === lastMove?.to ? annotationSym : null}
            onClick={() => handleClick(sq)}
          >
            {piece && (
              <PieceComp
                piece={{ color: piece.color, type: piece.type, square: sq }}
                square={sq}
                isDragging={activeDrag?.fromSq === sq}
                onPointerDown={onPointerDown}
              />
            )}
          </SquareCell>
        );
      })}
      {activeDrag && <DragGhost drag={activeDrag} />}
    </div>
  );
});
