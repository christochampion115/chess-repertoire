import React from 'react';

export interface SkeletonProps {
  width?: string;
  height?: string;
  variant?: 'text' | 'rect' | 'circle';
}

export const Skeleton = React.memo(function Skeleton({
  width,
  height,
  variant = 'rect',
}: SkeletonProps) {
  const style: React.CSSProperties = {};
  if (width) style.width = width;
  if (height) style.height = height;

  return (
    <div
      className={`skeleton skeleton--${variant}`}
      style={style}
      aria-hidden="true"
    />
  );
});
