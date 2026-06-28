import { useUiStore } from '@/stores/uiStore';
import { ModalBox } from './ModalBox';
import * as repertoireService from '@/services/repertoire';

export function SelectRepModal() {
  const modal = useUiStore((s) => s.activeModal);
  const closeModal = useUiStore((s) => s.closeModal);

  if (modal?.type !== 'select-repertoire') return null;

  const handleSelect = (nodeId: string) => {
    repertoireService.navigateToNode(nodeId);
    closeModal();
  };

  return (
    <ModalBox title="Position trouvée dans plusieurs répertoires">
      <p style={{ color: '#94a3b8', marginBottom: 12 }}>
        Cette position existe dans plusieurs répertoires de la même couleur.
        Dans lequel souhaitez-vous continuer&nbsp;?
      </p>
      {modal.repChoices.map((choice) => (
        <button
          key={choice.repIndex}
          onClick={() => handleSelect(choice.nodeId)}
          style={{
            display: 'block',
            width: '100%',
            padding: '10px 14px',
            marginBottom: 6,
            background: 'rgba(30,41,59,0.8)',
            border: '1px solid rgba(148,163,184,0.15)',
            borderRadius: 6,
            color: '#e2e8f0',
            cursor: 'pointer',
            textAlign: 'left',
            fontSize: '0.85rem',
          }}
        >
          {choice.repName}
        </button>
      ))}
      <div className="modal-actions">
        <button className="ctrl-btn" onClick={closeModal}>Annuler</button>
      </div>
    </ModalBox>
  );
}
