import { ModalBox } from './ModalBox';
import { stopTraining } from '@/services/training';

export function TrainingDoneModal() {
  const handleClose = () => {
    stopTraining();
  };

  return (
    <ModalBox title="Partie terminée !" onClose={handleClose} id="modal-training-done">
      Félicitations, vous avez terminé la partie.
      <div className="modal-actions">
        <button className="ctrl-btn ctrl-btn--primary" onClick={handleClose}>Fermer</button>
      </div>
    </ModalBox>
  );
}