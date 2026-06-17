import React from 'react';
import { ANNOTATION_STYLE } from '@/utils/annotationStyle';

export interface AnnotationBadgeProps {
  /** One of '!!', '!', '*', '!?', '?', '??' */
  annotation: string;
}

export const AnnotationBadge = React.memo(function AnnotationBadge({ annotation }: AnnotationBadgeProps) {
  const style = ANNOTATION_STYLE[annotation];
  if (!style) return null;

  return (
    <div
      className="annotation-badge"
      style={{ color: style.color }}
      title={annotation}
    >
      {style.label}
    </div>
  );
});
