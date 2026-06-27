import React, { useState, useMemo, useCallback } from 'react';
import type { ReportParams, PlayerTimeClass } from '@/types/report';
import { FenEditor } from './FenEditor';

interface ReportFormProps {
  params: ReportParams;
  onParamsChange: (patch: Partial<ReportParams>) => void;
  onSubmit: () => void;
  error: string | null;
}

function initYearOptions(): { value: string; label: string }[] {
  const now = new Date();
  const curYear = now.getFullYear();
  const years: { value: string; label: string }[] = [{ value: '', label: 'Année' }];
  for (let y = curYear; y >= 2010; y--) {
    years.push({ value: String(y), label: String(y) });
  }
  return years;
}

const MONTHS = [
  { value: '', label: 'Mois' },
  { value: '01', label: 'Jan' }, { value: '02', label: 'Fév' },
  { value: '03', label: 'Mar' }, { value: '04', label: 'Avr' },
  { value: '05', label: 'Mai' }, { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' }, { value: '08', label: 'Aoû' },
  { value: '09', label: 'Sep' }, { value: '10', label: 'Oct' },
  { value: '11', label: 'Nov' }, { value: '12', label: 'Déc' },
];

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(15,23,42,0.96)',
  border: '1px solid rgba(148,163,184,0.18)',
  borderRadius: 8,
  color: '#e2e8f0',
  padding: '10px 14px',
  fontSize: '0.92rem',
  outline: 'none',
};

const selectStyle: React.CSSProperties = {
  background: 'rgba(17,24,39,0.7)',
  border: '1px solid rgba(148,163,184,0.13)',
  borderRadius: 6,
  color: '#e2e8f0',
  padding: '9px 12px',
  fontSize: '0.88rem',
  outline: 'none',
  cursor: 'pointer',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.82rem',
  fontWeight: 600,
  color: '#94a3b8',
  marginBottom: 6,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '.1em',
  color: '#94a3b8',
  marginBottom: 10,
};

export const ReportForm = React.memo(function ReportForm({ params, onParamsChange, onSubmit, error }: ReportFormProps) {
  const [posFilterActive, setPosFilterActive] = useState(false);
  const years = useMemo(() => initYearOptions(), []);

  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = String(now.getMonth() + 1).padStart(2, '0');

  const handleFenChange = useCallback((fen: string, path: string) => {
    onParamsChange({ startFen: fen, startPath: path });
  }, [onParamsChange]);

  const togglePosFilter = useCallback(() => {
    const next = !posFilterActive;
    setPosFilterActive(next);
    if (!next) onParamsChange({ startFen: '', startPath: '' });
  }, [posFilterActive, onParamsChange]);

  return (
    <div>
      {/* ── outer flex: left column (grid + période) + right position card ── */}
      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', marginBottom: 20 }}>

        {/* ── LEFT COLUMN ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

          {/* 2-col grid — rows 1-4 total ~280 px (= board height)
              Row 3 paddingTop: 113 creates the inter-group gap:
              24 + 82 + (113+24) + 37 = 280 px */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              columnGap: 32,
              alignItems: 'start',
            }}
          >
            {/* Row 1 : section titles */}
            <div style={{ ...sectionTitleStyle }}>Compte Chess.com</div>
            <div style={{ ...sectionTitleStyle }}>Couleur</div>

            {/* Row 2 : username  |  couleur buttons */}
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle} htmlFor="rapport-username">Pseudo Chess.com</label>
              <input
                id="rapport-username"
                type="text"
                value={params.username}
                onChange={(e) => onParamsChange({ username: e.target.value })}
                placeholder="ex: Magnus"
                style={inputStyle}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            {/* paddingTop: 22 skips label height → buttons align with the input field */}
            <div style={{ marginBottom: 20, paddingTop: 22 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                {(['white', 'black'] as const).map((c) => (
                  <label
                    key={c}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      padding: 10,
                      background: 'rgba(15,23,42,0.96)',
                      border: `2px solid ${params.color === c ? 'rgba(122,174,203,0.5)' : 'rgba(148,163,184,0.18)'}`,
                      borderRadius: 8,
                      cursor: 'pointer',
                      color: params.color === c ? '#7aaecb' : '#94a3b8',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                    }}
                  >
                    <input
                      type="radio"
                      name="rapport-color"
                      value={c}
                      checked={params.color === c}
                      onChange={() => onParamsChange({ color: c })}
                      style={{ display: 'none' }}
                    />
                    {c === 'white' ? '♙ Blancs' : '♟ Noirs'}
                  </label>
                ))}
              </div>
            </div>

            {/* Row 3 : section titles — paddingTop: 45 = inter-group spacer */}
            <div style={{ ...sectionTitleStyle, paddingTop: 45 }}>Filtres de parties</div>
            <div style={{ ...sectionTitleStyle, paddingTop: 45 }}>ELO adversaire</div>

            {/* Row 4 : cadence  |  ELO inputs */}
            <div>
              <select
                id="rapport-timeclass"
                value={params.timeClass}
                onChange={(e) => onParamsChange({ timeClass: e.target.value as PlayerTimeClass })}
                style={{ ...selectStyle, width: '100%' }}
              >
                <option value="all">Toutes</option>
                <option value="bullet">Bullet</option>
                <option value="blitz">Blitz</option>
                <option value="rapid">Rapide</option>
                <option value="classical">Classique</option>
                <option value="daily">Correspondance</option>
              </select>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="number"
                  placeholder="Min"
                  min={0}
                  max={3000}
                  value={params.eloMin || ''}
                  onChange={(e) => onParamsChange({ eloMin: parseInt(e.target.value) || 0 })}
                  style={{ ...inputStyle, width: 100 }}
                />
                <span style={{ color: '#94a3b8', fontSize: '0.82rem' }}>—</span>
                <input
                  type="number"
                  placeholder="Max"
                  min={0}
                  max={3000}
                  value={params.eloMax === 3000 ? '' : params.eloMax}
                  onChange={(e) => onParamsChange({ eloMax: parseInt(e.target.value) || 3000 })}
                  style={{ ...inputStyle, width: 100 }}
                />
              </div>
            </div>
          </div>

          {/* ── PÉRIODE ── */}
          <div style={{ paddingTop: 52, marginBottom: 20 }}>
            <div style={sectionTitleStyle}>Période (de — à)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.82rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>De</span>
              <select
                value={params.dateFrom?.split('/')[0] || ''}
                onChange={(e) => {
                  const month = params.dateFrom?.split('/')[1] || '';
                  onParamsChange({ dateFrom: e.target.value ? `${e.target.value}/${month}` : '' });
                }}
                style={selectStyle}
              >
                {years.map((y) => <option key={y.value} value={y.value}>{y.label}</option>)}
              </select>
              <select
                value={params.dateFrom?.split('/')[1] || ''}
                onChange={(e) => {
                  const year = params.dateFrom?.split('/')[0] || '';
                  onParamsChange({ dateFrom: e.target.value ? `${year}/${e.target.value}` : '' });
                }}
                style={selectStyle}
              >
                {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <span style={{ fontSize: '0.82rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>à</span>
              <select
                value={params.dateTo?.split('/')[0] || curYear}
                onChange={(e) => {
                  const month = params.dateTo?.split('/')[1] || curMonth;
                  onParamsChange({ dateTo: e.target.value ? `${e.target.value}/${month}` : '' });
                }}
                style={selectStyle}
              >
                {years.map((y) => <option key={y.value} value={y.value}>{y.label}</option>)}
              </select>
              <select
                value={params.dateTo?.split('/')[1] || curMonth}
                onChange={(e) => {
                  const year = params.dateTo?.split('/')[0] || String(curYear);
                  onParamsChange({ dateTo: `${year}/${e.target.value}` });
                }}
                style={selectStyle}
              >
                {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>

          {/* ── LANCER ── */}
          <button
            type="button"
            onClick={onSubmit}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginTop: 16,
              padding: '13px 32px',
              background: 'rgba(122,174,203,0.85)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <span>🔍</span>
            Lancer l'analyse
          </button>

          {error && (
            <div
              style={{
                marginTop: 10,
                padding: '10px 14px',
                background: 'rgba(239,68,68,.12)',
                border: '1px solid rgba(239,68,68,.3)',
                borderRadius: 8,
                fontSize: '0.85rem',
                color: '#fca5a5',
              }}
            >
              {error}
            </div>
          )}

        </div>{/* end left column */}

        {/* ── POSITION CARD ── */}
        <div
          style={{
            width: 320,
            flexShrink: 0,
            background: 'rgba(15,23,42,0.92)',
            border: `1px solid ${posFilterActive ? 'rgba(122,174,203,0.35)' : 'rgba(148,163,184,0.15)'}`,
            borderRadius: 10,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            opacity: posFilterActive ? 1 : 0.55,
            transition: 'opacity 0.2s, border-color 0.2s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ ...sectionTitleStyle, marginBottom: 0, color: posFilterActive ? '#7aaecb' : '#94a3b8' }}>
              Filtre de position
            </div>
            <button
              type="button"
              onClick={togglePosFilter}
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                padding: '5px 12px',
                borderRadius: 6,
                background: posFilterActive ? 'rgba(122,174,203,0.2)' : 'rgba(148,163,184,0.08)',
                border: `1px solid ${posFilterActive ? 'rgba(122,174,203,0.4)' : 'rgba(148,163,184,0.2)'}`,
                color: posFilterActive ? '#7aaecb' : '#94a3b8',
                transition: 'background 0.2s, border-color 0.2s, color 0.2s',
              }}
            >
              {posFilterActive ? '✓ Actif' : 'Activer'}
            </button>
          </div>
          <div style={{ pointerEvents: posFilterActive ? 'auto' : 'none' }}>
            <FenEditor color={params.color} onFenChange={handleFenChange} active={posFilterActive} />
          </div>
          <p style={{ margin: 0, fontSize: '0.72rem', color: '#94a3b8', lineHeight: 1.4 }}>
            {posFilterActive
              ? "Jouez les coups sur l'échiquier. Le rapport ne gardera que les parties qui atteignent cette position."
              : "Activez le filtre pour restreindre l'analyse à une position précise."}
          </p>
        </div>

      </div>{/* end outer flex */}


    </div>
  );
});
