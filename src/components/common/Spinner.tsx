import React from 'react';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASS = {
  sm: 'spinner--sm',
  md: 'spinner--md',
  lg: 'spinner--lg',
} as const;

export const Spinner = React.memo(function Spinner({ size = 'md' }: SpinnerProps) {
  return <div className={`spinner ${SIZE_CLASS[size]}`} role="status" aria-label="Chargement" />;
});
