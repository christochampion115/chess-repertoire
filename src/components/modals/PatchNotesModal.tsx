import { useState } from 'react';
import { useUiStore } from '@/stores/uiStore';
import { ModalBox } from './ModalBox';
import { PATCH_NOTES } from '@/data/patchNotes';
import type { PatchNoteEntry } from '@/data/patchNotes';

export function PatchNotesModal() {
  const closeModal = useUiStore((s) => s.closeModal);
  const [selected, setSelected] = useState<PatchNoteEntry | null>(null);

  if (selected) {
    return (
      <ModalBox title="Notes de mise à jour" width={700}>
        <button className="patch-note-back" onClick={() => setSelected(null)}>
          ← Retour
        </button>
        <div className="patch-note-detail">
          <div className="patch-note-detail-header">
            <span className="patch-note-detail-date">{selected.date}</span>
            <h3 className="patch-note-detail-title">{selected.title}</h3>
          </div>
          <div className="patch-note-detail-body">
            {selected.content.split('\n').map((line, i) => {
              if (line.startsWith('• **')) {
                const bold = line.replace('• **', '').replace('**', '');
                return <p key={i} className="patch-note-bullet"><strong>{bold.split(':')[0]}</strong>{bold.includes(':') ? ':' + bold.split(':').slice(1).join(':') : ''}</p>;
              }
              if (line.startsWith('• ')) {
                return <p key={i} className="patch-note-bullet">{line.slice(2)}</p>;
              }
              if (line.startsWith('## ')) {
                return <h4 key={i} className="patch-note-section-title">{line.slice(3)}</h4>;
              }
              if (line.trim() === '') return <div key={i} style={{ height: 8 }} />;
              return <p key={i} className="patch-note-text">{line}</p>;
            })}
          </div>
        </div>
        <div className="modal-actions">
          <button className="ctrl-btn" onClick={closeModal}>Fermer</button>
        </div>
      </ModalBox>
    );
  }

  return (
    <ModalBox title="Notes de mise à jour" width={700}>
      <p style={{ marginTop: 0, marginBottom: 12, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
        Consultez l'historique des évolutions de Blundertale.
      </p>
      <div className="patch-notes-list">
        {[...PATCH_NOTES].reverse().map((note) => (
          <div
            key={note.id}
            className="patch-note-card"
            onClick={() => setSelected(note)}
          >
            <div className="patch-note-card-header">
              <span className="patch-note-date">{note.date}</span>
              <span className="patch-note-version">{note.id}</span>
            </div>
            <div className="patch-note-title">{note.title}</div>
            <div className="patch-note-excerpt">{note.excerpt}</div>
          </div>
        ))}
      </div>
      <div className="modal-actions">
        <button className="ctrl-btn" onClick={closeModal}>Fermer</button>
      </div>
    </ModalBox>
  );
}
