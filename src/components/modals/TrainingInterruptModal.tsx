import { useUiStore } from '@/stores/uiStore';
import { ModalBox } from './ModalBox';

export function TrainingInterruptModal() {
  const modal = useUiStore((s) => s.activeModal);
  const closeModal = useUiStore((s) => s.closeModal);
  const data = modal?.type === 'training-interrupt' ? modal : null;

  const handleConfirm = () => {
    closeModal();
    data?.onConfirm?.();
  };

  const handleCancel = () => {
    closeModal();
    data?.onCancel?.();
  };

  return (
    <ModalBox title={data?.title || 'Interrompre ?'}>
      <p>{data?.message || 'Voulez-vous vraiment interrompre ?'}</p>
      <div className="modal-actions">
        <button className="ctrl-btn" onClick={handleCancel}>
          {data?.cancelLabel || 'Annuler'}
        </button>
        <button className="ctrl-btn ctrl-btn--danger" onClick={handleConfirm}>
          {data?.confirmLabel || 'Interrompre'}
        </button>
      </div>
    </ModalBox>
  );
}
