import { useUiStore } from '@/stores/uiStore';
import { useRepertoireStore } from '@/stores/repertoireStore';
import { nodeMap, confirmDelete } from '@/services/repertoire';
import { countTotalChildren } from '@/bridge/arbre';
import { ModalBox } from './ModalBox';

export function ConfirmDeleteModal() {
  const modal = useUiStore((s) => s.activeModal);
  const closeModal = useUiStore((s) => s.closeModal);
  const handleConfirm = () => {
    if (modal?.type !== 'delete-confirm') return;
    confirmDelete(modal.itemId);
    closeModal();
  };

  function renderMessage() {
    if (modal?.type !== 'delete-confirm') return null;

    if (modal.deleteType === 'repertoire') {
      const rep = useRepertoireStore.getState().repertoires.find(r => r.id === modal.itemId);
      if (rep) {
        const total = countTotalChildren(rep);
        return <>Souhaitez-vous vraiment supprimer le répertoire <b>{rep.name}</b> ainsi que les <b>{total}</b> coups qui le suivent ?</>;
      }
    } else {
      const target = nodeMap.get(modal.itemId);
      if (target && target.parentId) {
        const total = countTotalChildren(target);
        const label = `${target.turn === 'w' ? target.moveNum + '.' : target.moveNum + '...'} ${target.san}`;
        return <>Voulez-vous effacer le coup <b>{label}</b> ainsi que les <b>{total}</b> coups qui le suivent ?</>;
      }
    }

    return <>Aucune cible à supprimer.</>;
  }

  return (
    <ModalBox title="Confirmer la suppression">
      <p>{renderMessage() || 'Chargement\u2026'}</p>
      <div className="modal-actions">
        <button className="ctrl-btn" onClick={closeModal}>Annuler</button>
        <button className="ctrl-btn ctrl-btn--danger" onClick={handleConfirm}>Supprimer</button>
      </div>
    </ModalBox>
  );
}
