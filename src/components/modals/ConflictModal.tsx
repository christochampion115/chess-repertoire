import React from 'react';
import { useUiStore } from '@/stores/uiStore';
import { resolveConflict } from '@/services/authService';
import { ModalBox } from './ModalBox';

export function ConflictModal() {
  const modal = useUiStore((s) => s.activeModal);
  const closeModal = useUiStore((s) => s.closeModal);

  if (modal?.type !== 'conflict') return null;
  const { localRepId, serverId, serverRep, serverUpdatedAt } = modal;

  const handleOverwrite = async () => {
    closeModal();
    await resolveConflict(localRepId, serverId, 'overwrite', serverRep, serverUpdatedAt);
  };

  const handleKeepServer = async () => {
    closeModal();
    await resolveConflict(localRepId, serverId, 'keep-server', serverRep, serverUpdatedAt);
  };

  return (
    <ModalBox title="Conflit de modification">
      <p style={{ color: '#cbd5e1', marginBottom: 16, lineHeight: 1.55 }}>
        Ce répertoire a été modifié sur un autre appareil depuis votre dernière synchronisation.
        Que souhaitez-vous faire ?
      </p>
      <div className="modal-actions" style={{ gap: 10 }}>
        <button className="ctrl-btn" onClick={handleKeepServer}>
          Garder la version serveur
        </button>
        <button className="ctrl-btn ctrl-btn--danger" onClick={handleOverwrite}>
          Écraser avec mes modifications
        </button>
      </div>
    </ModalBox>
  );
}
