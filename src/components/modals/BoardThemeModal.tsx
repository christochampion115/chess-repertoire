import { useUiStore } from '@/stores/uiStore';
import { useChessStore } from '@/stores/chessStore';
import { syncUserSettings } from '@/bridge/auth';
import { ModalBox } from './ModalBox';

const THEMES = [
  { id: 'classic', label: 'Classique', light: '#ebecd0', dark: '#779556' },
  { id: 'blue',    label: 'Bleu',     light: '#d0e7ff', dark: '#4a90e2' },
  { id: 'gray',    label: 'Gris',     light: '#e5e5e5', dark: '#666' },
  { id: 'rose',    label: 'Rose',     light: '#ffd6e7', dark: '#ff8ab8' },
  { id: 'mauve',   label: 'Mauve',    light: '#f3e8ff', dark: '#b388ff' },
  { id: 'wood',    label: 'Bois',     light: '#f0d9b5', dark: '#b58863' },
];

export function BoardThemeModal() {
  const closeModal    = useUiStore((s) => s.closeModal);
  const setBoardTheme = useChessStore((s) => s.setBoardTheme);

  const handleSelect = (light: string, dark: string) => {
    setBoardTheme({ light, dark });
    syncUserSettings();
    closeModal();
  };

  return (
    <ModalBox title="Thème de l'échiquier" onClose={closeModal}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {THEMES.map((t) => (
          <button key={t.id} className="ctrl-btn" onClick={() => handleSelect(t.light, t.dark)}>
            {t.label}
          </button>
        ))}
      </div>
    </ModalBox>
  );
}
