import React, { useState, useMemo, useCallback } from 'react';
import type { ReportParams, PlayerTimeClass } from '@/types/report';
import { FenEditor } from './FenEditor';
import { estimateDuration } from '@/services/report';

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

export const ReportForm = React.memo(function ReportForm({ params, onParamsChange, onSubmit, error }: ReportFormProps) {
  const [advOpen, setAdvOpen] = useState(false);
  const [posEnabled, setPosEnabled] = useState(false);
  const years = useMemo(() => initYearOptions(), []);

  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = String(now.getMonth() + 1).padStart(2, '0');

  const dateFrom = params.dateFrom;
  const dateTo = params.dateTo;
  const durEstimate = estimateDuration(
    dateFrom ? `${dateFrom.replace('/', '-')}` : undefined,
    dateTo ? `${dateTo.replace('/', '-')}` : undefined
  );

  const handleFenChange = useCallback((fen: string, path: string) => {
    onParamsChange({ startFen: fen, startPath: path });
  }, [onParamsChange]);

  return (
    <div
      style={{
        background: 'rgba(17,24,39,0.96)',
        border: '1px solid rgba(148,163,184,0.18)',
        borderRadius: 10,
        padding: '28px 32px',
      }}
    >
      <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: '#94a3b8', marginBottom: 14 }}>
        Compte Chess.com
      </div>

      <div style={{ marginBottom: 18 }}>
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

      <div style={{ marginBottom: 18 }}>
        <label style={labelStyle}>Couleur analysée</label>
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

      <button
        type="button"
        onClick={() => setAdvOpen(!advOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'none',
          border: 'none',
          color: '#94a3b8',
          fontSize: '0.82rem',
          cursor: 'pointer',
          padding: '6px 0',
        }}
      >
        <span style={{ transition: 'transform 0.2s', display: 'inline-block', transform: advOpen ? 'rotate(90deg)' : undefined }}>
          ›
        </span>
        Filtres avancés
      </button>

      {advOpen && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: '#94a3b8', marginBottom: 14, marginTop: 22 }}>
            Filtres de parties
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle} htmlFor="rapport-timeclass">Cadence</label>
            <select
              id="rapport-timeclass"
              value={params.timeClass}
              onChange={(e) => onParamsChange({ timeClass: e.target.value as PlayerTimeClass })}
              style={selectStyle}
            >
              <option value="all">Toutes</option>
              <option value="bullet">Bullet</option>
              <option value="blitz">Blitz</option>
              <option value="rapid">Rapide</option>
              <option value="classical">Classique</option>
              <option value="daily">Correspondance</option>
            </select>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Période (de — à)</label>
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

          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>ELO adversaire</label>
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

          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: '#94a3b8', marginBottom: 14, marginTop: 22 }}>
            Paramètres d'analyse
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', color: '#e2e8f0', cursor: 'pointer', marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={posEnabled}
                onChange={(e) => setPosEnabled(e.target.checked)}
                style={{ accentColor: '#7aaecb' }}
              />
              Activer un filtre de position précis
            </label>
            {posEnabled && (
              <div
                style={{
                  padding: 14,
                  border: '1px solid rgba(148,163,184,0.18)',
                  borderRadius: 10,
                  background: 'rgba(13,27,42,0.55)',
                }}
              >
                <FenEditor color={params.color} onFenChange={handleFenChange} />
                <p style={{ marginTop: 8, fontSize: '0.76rem', color: '#94a3b8', lineHeight: 1.45 }}>
                  Jouez les coups sur ce mini-échiquier. Le rapport ne gardera que les parties qui atteignent exactement cette position.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: 20,
          padding: '10px 16px',
          background: 'rgba(122,174,203,0.07)',
          border: '1px solid rgba(122,174,203,0.15)',
          borderRadius: 8,
          fontSize: '0.82rem',
          color: '#94a3b8',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span>⏱</span>
        <span>~{durEstimate}s estimés</span>
      </div>

      {error && (
        <div
          style={{
            marginTop: 12,
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

      <button
        type="button"
        onClick={onSubmit}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          width: '100%',
          padding: 13,
          marginTop: 22,
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
    </div>
  );
});
