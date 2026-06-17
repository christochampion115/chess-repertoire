import { useEffect, useRef } from 'react';
import { useUiStore } from '@/stores/uiStore';

export function ContextMenu() {
  const ctxMenu = useUiStore((s) => s.ctxMenu);
  const closeCtxMenu = useUiStore((s) => s.closeCtxMenu);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ctxMenu) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        closeCtxMenu();
      }
    };
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handler);
    };
  }, [ctxMenu, closeCtxMenu]);

  useEffect(() => {
    if (!ctxMenu) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCtxMenu();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [ctxMenu, closeCtxMenu]);

  if (!ctxMenu) return null;

  return (
    <div
      ref={ref}
      className="ctx-menu"
      style={{ left: ctxMenu.x, top: ctxMenu.y, display: 'block' }}
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