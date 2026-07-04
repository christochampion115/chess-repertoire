import { useRef } from 'react';
import type { ReactNode } from 'react';
import { useUiStore } from '@/stores/uiStore';

interface ModalBoxProps {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  width?: number;
  maxHeight?: number;
  id?: string;
}

export function ModalBox({ title, children, onClose, width, maxHeight, id }: ModalBoxProps) {
  const closeModal = useUiStore((s) => s.closeModal);
  const handleClose = onClose ?? closeModal;
  const pointerDownInside = useRef(false);

  return (
    <div
      id="modal-overlay"
      style={{ display: 'flex' }}
      onPointerDown={() => pointerDownInside.current = false}
      onClick={() => {
        if (pointerDownInside.current) {
          pointerDownInside.current = false;
          return;
        }
        handleClose();
      }}
    >
      <div
        id={id}
        className="modal-box"
        style={{ display: 'block', width, maxWidth: width, maxHeight, overflowY: maxHeight ? 'auto' : undefined }}
        onPointerDown={(e) => {
          pointerDownInside.current = true;
          e.stopPropagation();
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ marginBottom: 0 }}>{title}</h3>
          <button
            onClick={handleClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.3rem', cursor: 'pointer', padding: 0, lineHeight: 1, opacity: 0.7 }}
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}
