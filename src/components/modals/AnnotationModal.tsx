import React from 'react';
import { useUiStore } from '@/stores/uiStore';
import { ModalBox } from './ModalBox';
import { selectSymbol } from '@/services/repertoire';

const SYMBOLS = [
  { label: 'Bon coup',      sym: '!' },
  { label: 'Coup faible',   sym: '?' },
  { label: 'Coup brillant', sym: '!!' },
  { label: 'Gaffe',         sym: '??' },
  { label: 'Intéressant',   sym: '!?' },
  { label: 'Douteux',       sym: '?!' },
  { label: 'OK',            sym: 'v' },
  { label: 'Bon',           sym: '+' },
  { label: 'Génial',        sym: '*' },
];

export function AnnotationModal() {
  const closeModal = useUiStore((s) => s.closeModal);

  const handleClick = (sym: string) => {
    selectSymbol(sym);
    closeModal();
  };

  return (
    <ModalBox title="Annoter le coup">
      <div className="annotation-grid">
        {SYMBOLS.map(({ label, sym }) => (
          <button
            key={sym}
            className="ctrl-btn annotation-btn"
            onClick={() => handleClick(sym)}
          >
            <span className="annotation-sym">{sym}</span>
            <span className="annotation-label">{label}</span>
          </button>
        ))}
      </div>
      <div className="modal-actions">
        <button className="ctrl-btn danger" onClick={() => handleClick('')}>
          Supprimer l'annotation
        </button>
        <button className="ctrl-btn" onClick={closeModal}>Annuler</button>
      </div>
    </ModalBox>
  );
}
