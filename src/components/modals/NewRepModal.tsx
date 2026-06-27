import { useState, useEffect, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { useUiStore } from '@/stores/uiStore';
import { useRepertoireStore } from '@/stores/repertoireStore';
import { useChessStore } from '@/stores/chessStore';
import { useTrainingStore } from '@/stores/trainingStore';
import { ModalBox } from './ModalBox';
import * as repertoireService from '@/services/repertoire';
import * as pgnService from '@/services/pgn';

type CreationMode = 'start' | 'current' | 'pgn-file' | 'pgn-text';

const MODES: Array<{ id: CreationMode; label: string }> = [
  { id: 'start',    label: 'Position initiale' },
  { id: 'current',  label: 'Position actuelle' },
  { id: 'pgn-file', label: 'Fichier PGN' },
  { id: 'pgn-text', label: 'Coller le texte' },
];

/** Filtre les dossiers correspondant à la couleur choisie. */
function foldersForColor(
  repFolders: Record<string, string>,
  repertoires: Array<{ id: string; color?: string; folderId?: string | null }>,
  color: 'w' | 'b',
): Array<{ id: string; name: string }> {
  // Collect folderIds used by reps of the given color
  const usedIds = new Set<string>();
  for (const r of repertoires) {
    if (r.color === color && r.folderId) usedIds.add(r.folderId);
  }
  return Object.entries(repFolders)
    .filter(([id]) => usedIds.has(id))
    .map(([id, name]) => ({ id, name }));
}

export function NewRepModal() {
  const modal       = useUiStore((s) => s.activeModal);
  const closeModal  = useUiStore((s) => s.closeModal);
  const openModal   = useUiStore((s) => s.openModal);

  const repFolders  = useRepertoireStore((s) => s.repFolders);
  const repertoires = useRepertoireStore((s) => s.repertoires);

  const isOpen      = modal?.type === 'new-repertoire' || modal?.type === 'rename';
  const isRename    = modal?.type === 'rename';

  // Local form state
  const [mode,           setMode]           = useState<CreationMode>('start');
  const [name,           setName]           = useState('');
  const [selectedColor,  setSelectedColor]  = useState<'w' | 'b'>('w');
  const [folderValue,    setFolderValue]    = useState<string>('');
  const [newFolderName,  setNewFolderName]  = useState('');
  const [pgnText,        setPgnText]        = useState('');
  const [error,          setError]          = useState('');
  const [pgnLoading,     setPgnLoading]     = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (modal?.type === 'new-repertoire') {
      setMode(modal.initialMode ?? 'start');
      setName('');
      setSelectedColor(modal.initialColor ?? 'w');
      setFolderValue('');
      setNewFolderName('');
      setPgnText('');
      setError('');
      setPgnLoading(false);
    } else if (modal?.type === 'rename') {
      const store = useRepertoireStore.getState();
      const current = store.repertoires[store.activeRepIndex];
      setName(current?.name ?? '');
      setError('');
    }
  }, [modal?.type]);

  if (!isOpen) return null;

  const folders = foldersForColor(repFolders, repertoires, selectedColor);
  const resolvedFolderId = folderValue === '__new__' ? '__new__' : (folderValue || null);

  // Training guard — redirect to interrupt modal before opening if training active
  const guardTraining = (onConfirm: () => void) => {
    if (useTrainingStore.getState().phase !== 'idle') {
      openModal({
        type: 'training-interrupt',
        title: 'Créer un répertoire ?',
        message: 'Une session d\'entraînement est en cours. L\'interrompre pour créer un répertoire ?',
        onConfirm,
      });
      return false;
    }
    return true;
  };

  const handleConfirm = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError('Veuillez entrer un nom.'); return; }

    if (isRename) {
      repertoireService.renameRepertoire(trimmed);
      closeModal();
      return;
    }

    if (!guardTraining(() => handleConfirm())) return;

    setError('');

    if (folderValue === '__new__') {
      useRepertoireStore.getState().setPendingNewRepFolder('__new__', newFolderName.trim() || '');
    }

    try {
      if (mode === 'start') {
        repertoireService.createNewRepertoire(trimmed, selectedColor, resolvedFolderId);
        closeModal();

      } else if (mode === 'current') {
        const cid = useRepertoireStore.getState().currentNodeId;
        if (!cid) { setError('Aucune position actuelle (ouvrez un répertoire d\'abord).'); return; }
        const sans = pgnService.getCurrentLineMoves(cid);
        if (sans.length > 0) {
          pgnService.buildRepertoireFromMoves(sans, trimmed, selectedColor, resolvedFolderId);
        } else {
          const currentFen = useChessStore.getState().chess.fen();
          repertoireService.createNewRepertoire(trimmed, selectedColor, resolvedFolderId, false, currentFen);
        }
        closeModal();

      } else if (mode === 'pgn-text') {
        if (!pgnText.trim()) { setError('Collez un texte.'); return; }
        setPgnLoading(true);
        try {
          const moves = pgnService.importPGN(pgnText);
          pgnService.buildRepertoireFromPgnMoves(moves, trimmed, selectedColor, resolvedFolderId);
          closeModal();
        } finally {
          setPgnLoading(false);
        }

      } else if (mode === 'pgn-file') {
        const file = fileInputRef.current?.files?.[0];
        if (!file) { setError('Veuillez sélectionner un fichier PGN.'); return; }
        setPgnLoading(true);
        try {
          const text = await file.text();
          const moves = pgnService.importPGN(text);
          pgnService.buildRepertoireFromPgnMoves(moves, trimmed, selectedColor, resolvedFolderId);
          closeModal();
        } finally {
          setPgnLoading(false);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l\'import.');
      setPgnLoading(false);
    }
  };

  const title = isRename ? 'Renommer le répertoire' : 'Nouveau répertoire';

  return (
    <ModalBox title={title}>
      {/* Mode selector — hidden in rename mode */}
      {!isRename && (
        <div className="rep-create-mode-selector">
          {MODES.map((m) => (
            <button
              key={m.id}
              className={`rep-create-mode-btn${mode === m.id ? ' active' : ''}`}
              onClick={() => { setMode(m.id); setError(''); }}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {/* Color selector — hidden in rename mode */}
      {!isRename && (
        <div className="color-selector" id="color-sel-container">
          <div
            className={`color-opt${selectedColor === 'w' ? ' active' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => { setSelectedColor('w'); setFolderValue(''); }}
            onKeyDown={(e) => e.key === 'Enter' && (setSelectedColor('w'), setFolderValue(''))}
          >
            ♔ Blancs
          </div>
          <div
            className={`color-opt${selectedColor === 'b' ? ' active' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => { setSelectedColor('b'); setFolderValue(''); }}
            onKeyDown={(e) => e.key === 'Enter' && (setSelectedColor('b'), setFolderValue(''))}
          >
            ♚ Noirs
          </div>
        </div>
      )}

      {/* Name input */}
      <input
        type="text"
        id="rep-name-input"
        placeholder="Nouveau répertoire"
        value={name}
        onChange={(e) => { setName(e.target.value); setError(''); }}
        onKeyDown={(e) => { if (e.key === 'Enter') void handleConfirm(); }}
        autoFocus
      />

      {/* Folder selector — hidden in rename mode */}
      {!isRename && (
        <div className="rep-folder-container">
          <select
            id="rep-folder-select"
            value={folderValue}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setFolderValue(e.target.value)}
          >
            <option value="">— Aucun dossier —</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
            <option value="__new__">+ Nouveau dossier…</option>
          </select>

          {folderValue === '__new__' && (
            <input
              type="text"
              id="rep-folder-new-name"
              placeholder="Nom du dossier"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              style={{ marginTop: 6 }}
            />
          )}
        </div>
      )}

      {/* PGN file input */}
      {!isRename && mode === 'pgn-file' && (
        <div className="pgn-import-section">
          <input
            ref={fileInputRef}
            type="file"
            id="pgn-file-input"
            accept=".pgn,text/plain"
          />
        </div>
      )}

      {/* PGN text area */}
      {!isRename && mode === 'pgn-text' && (
        <div className="pgn-import-section">
          <textarea
            id="pgn-import-input"
            placeholder="Collez votre texte ici…"
            value={pgnText}
            onChange={(e) => setPgnText(e.target.value)}
            rows={6}
          />
        </div>
      )}

      {/* Info for 'current' mode */}
      {!isRename && mode === 'current' && (
        <p className="rep-current-info" id="rep-current-info">
          Le répertoire sera initialisé avec la ligne de coups de la position actuelle.
        </p>
      )}

      {/* PGN loading indicator */}
      {pgnLoading && (
        <div id="pgn-import-loading" style={{ textAlign: 'center', padding: 8 }}>
          Import en cours…
        </div>
      )}

      {error && <p className="rep-create-error" style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</p>}

      <div className="modal-actions">
        <button className="ctrl-btn" onClick={closeModal} disabled={pgnLoading}>
          Annuler
        </button>
        <button
          className="ctrl-btn ctrl-btn--primary"
          id="btn-rep-confirm"
          onClick={() => void handleConfirm()}
          disabled={pgnLoading}
        >
          {isRename ? 'Renommer' : 'Créer'}
        </button>
      </div>
    </ModalBox>
  );
}
