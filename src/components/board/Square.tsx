import React from 'react';
import type { Square as SquareType, BoardTheme } from '@/types/chess';
import { ANNOTATION_STYLE, hexToRgba } from '@/utils/annotationStyle';

export interface SquareProps {
  square: SquareType;
  isLight: boolean;
  theme: BoardTheme;
  isSelected: boolean;
  isLastMove: boolean;
  isDragTarget: boolean;
  /** 'dot' = empty legal target, 'ring' = legal capture target */
  legalIndicator: 'dot' | 'ring' | null;
  /** Training feedback overlay */
  feedbackType: 'correct' | 'wrong' | 'retry' | null;
  /** True when this square is the feedback source (only colored background, no icon) */
  isFeedbackSrc?: boolean;
  /** Optional annotation symbol ('!', '?', '!!', '??', '!?', '?!') */
  annotationSym?: string | null;
  onClick: () => void;
  children?: React.ReactNode;
}

export const Square = React.memo(function Square({
  square,
  isLight,
  theme,
  isSelected,
  isLastMove,
  isDragTarget,
  legalIndicator,
  feedbackType,
  isFeedbackSrc,
  annotationSym,
  onClick,
  children,
}: SquareProps) {
  const bg = isLight ? theme.light : theme.dark;
  const isHighlighted = isSelected || isLastMove;
  const annotStyle = annotationSym ? ANNOTATION_STYLE[annotationSym] : null;

  let feedbackClass = '';
  if (feedbackType === 'correct') feedbackClass = ' sq-correct';
  else if (feedbackType === 'wrong') feedbackClass = ' sq-wrong';
  else if (feedbackType === 'retry') feedbackClass = ' sq-retry';

  const style: React.CSSProperties = { backgroundColor: bg };
  if (isHighlighted && annotStyle) {
    (style as Record<string, string>)['--sq-highlight'] = hexToRgba(annotStyle.color, 0.75);
  }

  return (
    <div
      className={`square${isHighlighted ? ' highlight' : ''}${feedbackClass}${isDragTarget ? ' drag-target' : ''}${isFeedbackSrc ? ' sq-feedback-src' : ''}`}
      data-sq={square}
      style={style}
      onClick={onClick}
    >
      {children}
      {annotStyle && (
        <div
          className="annotation-badge"
          style={{ background: annotStyle.color }}
        >
          {annotStyle.label}
        </div>
      )}
      {legalIndicator && (
        <div
          className={`legal-indicator ${
            legalIndicator === 'ring'
              ? 'legal-indicator--ring'
              : 'legal-indicator--dot'
          }`}
        />
      )}
    </div>
  );
});
