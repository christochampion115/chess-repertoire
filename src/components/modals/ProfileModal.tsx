import { useEffect, useState } from 'react';
import { useUiStore } from '@/stores/uiStore';
import { ModalBox } from './ModalBox';

export function ProfileModal() {
  const closeModal = useUiStore((s) => s.closeModal);
  const [profile, setProfile] = useState<{ username?: string; rating?: number } | null>(null);

  useEffect(() => {
    (async () => {
      const { state } = await import('@/jsBridge');
      setProfile(state.lichessProfile || null);
    })();
  }, []);

  return (
    <ModalBox title="Profil">
      {profile ? (
        <>
          <p><strong>Pseudo :</strong> {profile.username}</p>
          {profile.rating != null && <p><strong>Classement :</strong> {profile.rating}</p>}
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
