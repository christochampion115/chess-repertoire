import { useUiStore } from '@/stores/uiStore';
import { ModalBox } from './ModalBox';

const TIERS = [
  {
    tier: 'bronze', icon: '🥉', label: 'Bronze',
    rule: 'Débloquée au-delà de 30% de progression.',
    variants: 'Brillance par taille: 0-50, 51-100, 101-200, 201-350, 351-500, 500+ coups.',
    tokens: ['🥉','🥉','🥉','🥉','🥉','🥉'],
    shines: [0,1,2,3,4,5],
  },
  {
    tier: 'silver', icon: '🥈', label: 'Argent',
    rule: 'Débloquée au-delà de 60% de progression.',
    variants: 'Brillance par taille: 0-50, 51-100, 101-200, 201-350, 351-500, 500+ coups.',
    tokens: ['🥈','🥈','🥈','🥈','🥈','🥈'],
    shines: [0,1,2,3,4,5],
  },
  {
    tier: 'gold', icon: '🥇', label: 'Or',
    rule: 'Débloquée quand la progression atteint 100% sur les positions cibles.',
    variants: 'Si répertoire > 200 coups: évolue en Platine.',
    tokens: ['🥇','🥇','🥇','🥇','🥇','🥇'],
    shines: [0,1,2,3,4,5],
  },
  {
    tier: 'platinum', icon: '✦', label: 'Platine',
    rule: 'Version évoluée de l\'or si le répertoire dépasse 200 coups.',
    variants: 'Si répertoire > 350 coups: évolue en Diamant.',
    tokens: ['✦','✦','✦'],
    shines: [],
  },
  {
    tier: 'diamond', icon: '◆', label: 'Diamant',
    rule: 'Version évoluée si le répertoire dépasse 350 coups.',
    variants: 'Si répertoire > 500 coups: évolue en Chromée.',
    tokens: ['◆','◆','◆'],
    shines: [],
  },
  {
    tier: 'chrome', icon: '✦', label: 'Chromée animée',
    rule: 'Version ultime si le répertoire dépasse 500 coups.',
    variants: 'Animation brillante permanente + halo intensifié.',
    tokens: ['✦','✦','✦'],
    shines: [],
  },
];

export function MedalsModal() {
  const closeModal = useUiStore((s) => s.closeModal);

  return (
    <ModalBox title="Galerie des médailles" width={760}>
      <p style={{ marginTop: 0, marginBottom: 10 }}>
        Outil visuel : affichage de toutes les variantes de rendu (sans jouer).
      </p>
      <div className="medals-gallery" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: 'auto auto auto', gap: 10, marginTop: 6 }}>
        {TIERS.map((t, i) => (
          <div key={t.tier} className={`medal-card tier-${t.tier}`} style={{ gridRow: (i % 3) + 1, gridColumn: i < 3 ? 1 : 2 }}>
            <div className="medal-card-head">
              <span className="medal-card-icon">{t.icon}</span>
              <span className="medal-card-title">{t.label}</span>
            </div>
            <div className="medal-card-rule">{t.rule}</div>
            <div className="medal-card-variants">{t.variants}</div>
            <div className="medal-showcase-row">
              {t.tokens.map((token, j) => (
                <span
                  key={j}
                  className={`medal-showcase-token tier-${t.tier}`}
                  data-shine={t.shines[j] ?? ''}
                >
                  {token}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="modal-actions">
        <button className="ctrl-btn" onClick={closeModal}>Fermer</button>
      </div>
    </ModalBox>
  );
}
