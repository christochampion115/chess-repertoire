import { useRef } from 'react';
import type { ReactNode } from 'react';
import { useUiStore } from '@/stores/uiStore';

interface ModalBoxProps {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  width?: number;
  id?: string;
}

export function ModalBox({ title, children, onClose, width, id }: ModalBoxProps) {
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
        style={{ display: 'block', width, maxWidth: width }}
        onPointerDown={(e) => {
          pointerDownInside.current = true;
          e.stopPropagation();
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{title}</h3>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}
