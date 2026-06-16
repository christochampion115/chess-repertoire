import { useEffect, useRef, useState } from 'react';

export function useAnimatedCounter(target: number, duration = 5000): number {
  const [display, setDisplay] = useState(target);
  const rafRef = useRef(0);
  const startRef = useRef(0);
  const fromRef = useRef(target);
  const targetRef = useRef(target);
  const displayRef = useRef(target);
  displayRef.current = display;

  useEffect(() => {
    if (target === targetRef.current) return;

    fromRef.current = displayRef.current;
    targetRef.current = target;
    startRef.current = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startRef.current;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(fromRef.current + (targetRef.current - fromRef.current) * eased);
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return display;
}
