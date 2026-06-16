import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';
import { ModalBox } from './ModalBox';

export function ProfileModal() {
  const closeModal = useUiStore((s) => s.closeModal);
  const user = useAuthStore((s) => s.user);

  return (
    <ModalBox title="Profil">
      {user ? (
        <>
          <p><strong>Pseudo :</strong> {user.username}</p>
        </>
      ) : (
        <p>Connectez-vous pour voir votre profil.</p>
      )}
      <div className="modal-actions">
        <button className="ctrl-btn" onClick={closeModal}>Fermer</button>
      </div>
    </ModalBox>
  );
}
