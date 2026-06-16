import { useState, useEffect } from 'react';
import { useUiStore } from '@/stores/uiStore';
import { useRepertoireStore } from '@/stores/repertoireStore';
import { nodeMap } from '@/services/repertoire';
import { ModalBox } from './ModalBox';

export function CommentModal() {
  const closeModal = useUiStore((s) => s.closeModal);
  const menuTargetId = useRepertoireStore((s) => s.menuTargetId);
  const [comment, setComment] = useState('');

  useEffect(() => {
    const node = menuTargetId ? nodeMap.get(menuTargetId) : undefined;
    setComment(node?.comment ?? '');
  }, [menuTargetId]);

  const handleSave = () => {
    if (menuTargetId) {
      const node = nodeMap.get(menuTargetId);
      if (node) {
        node.comment = comment;
        const { version } = useRepertoireStore.getState();
        useRepertoireStore.setState({ version: version + 1 });
      }
    }
    closeModal();
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
