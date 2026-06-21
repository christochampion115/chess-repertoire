import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useUiStore } from '@/stores/uiStore';

export function ContextMenu() {
  const ctxMenu = useUiStore((s) => s.ctxMenu);
  const closeCtxMenu = useUiStore((s) => s.closeCtxMenu);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  // Ajuste la position après rendu pour ne pas déborder
  useLayoutEffect(() => {
    if (!ctxMenu || !ref.current) { setPos(null); return; }
    const rect = ref.current.getBoundingClientRect();
    let x = ctxMenu.x;
    let y = ctxMenu.y;
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
    if (x < 0) x = 8;
    if (y < 0) y = 8;
    setPos({ x: x + window.scrollX, y: y + window.scrollY });
  }, [ctxMenu]);

  // Fermeture au clic gauche extérieur (le clic droit est géré par buildContextMenu)
  useEffect(() => {
    if (!ctxMenu) return;
    const onClickOutside = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (ref.current && !ref.current.contains(e.target as Node)) closeCtxMenu();
    };
    const id = setTimeout(() => document.addEventListener('mousedown', onClickOutside), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [ctxMenu, closeCtxMenu]);

  // Fermeture via Escape
  useEffect(() => {
    if (!ctxMenu) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCtxMenu();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [ctxMenu, closeCtxMenu]);

  if (!ctxMenu) return null;

  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const style: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, display: 'block' }
    : { left: ctxMenu.x + scrollX, top: ctxMenu.y + scrollY, display: 'block', visibility: 'hidden' };

  return (
    <div
      ref={ref}
      className="ctx-menu"
      style={style}
      onContextMenu={(e) => e.preventDefault()}
    >
      {ctxMenu.items.map((item, i) => {
        if (item.divider) {
          return <div key={i} className="ctx-menu__divider" />;
        }
        if (item.isLabel) {
          return (
            <div key={i} className="ctx-menu__label">
              {item.label}
            </div>
          );
        }
        return (
          <button
            key={i}
            disabled={item.disabled}
            className={`ctx-menu__item${item.disabled ? ' ctx-menu__item--disabled' : ''}`}
            style={{ color: item.color }}
            onClick={() => { item.onClick?.(); closeCtxMenu(); }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}