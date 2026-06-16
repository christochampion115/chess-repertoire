import { useState, useEffect } from 'react';
import { useUiStore } from '@/stores/uiStore';
import { ModalBox } from './ModalBox';

export function CommentModal() {
  const closeModal = useUiStore((s) => s.closeModal);
  const [comment, setComment] = useState('');

  useEffect(() => {
    (async () => {
      const { state } = await import('@/jsBridge');
      setComment(state.menuTarget?.comment || '');
    })();
  }, []);

  const handleSave = async () => {
    const { state, eventBus } = await import('@/jsBridge');
    if (state.menuTarget) {
      state.menuTarget.comment = comment;
    }
    closeModal();
    eventBus.emit('render');
  };

  return (
    <ModalBox title="Commentaire">
      <textarea
        rows={4}
        placeholder="Ajouter un commentaire…"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        autoFocus
      />
      <div className="modal-actions">
        <button className="ctrl-btn" onClick={closeModal}>Annuler</button>
        <button className="ctrl-btn ctrl-btn--primary" onClick={handleSave}>Enregistrer</button>
      </div>
    </ModalBox>
  );
}
