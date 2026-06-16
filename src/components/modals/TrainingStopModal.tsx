import { useUiStore } from '@/stores/uiStore';
import { ModalBox } from './ModalBox';
import { stopTraining } from '@/services/training';

export function TrainingStopModal() {
  const closeModal = useUiStore((s) => s.closeModal);

  const handleStop = () => {
    stopTraining();
  };

  return (
    <ModalBox title="Arrêter la partie ?">
      <p>Voulez-vous vraiment arrêter la partie en cours ?</p>
      <div className="modal-actions">
        <button className="ctrl-btn" onClick={closeModal}>Annuler</button>
        <button className="ctrl-btn ctrl-btn--danger" onClick={handleStop}>Arrêter</button>
      </div>
    </ModalBox>
  );
}
