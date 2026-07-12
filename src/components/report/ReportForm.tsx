import React, { useState, useMemo, useCallback, useRef } from 'react';
import type { ReportParams, PlayerTimeClass } from '@/types/report';
import { FenEditor } from './FenEditor';
import { inputStyle, btnPrimary, cardLg } from './reportStyles';
import './report.css';

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
  const [posCardOpen, setPosCardOpen] = useState(true);
  const years = useMemo(() => initYearOptions(), []);

  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = String(now.getMonth() + 1).padStart(2, '0');

  const handleFenChange = useCallback((fen: string, path: string) => {
    if (!posFilterActive) return;
    onParamsChange({ startFen: fen, startPath: path });
  }, [posFilterActive, onParamsChange]);

  const togglePosFilter = useCallback(() => {
    const next = !posFilterActive;
    setPosFilterActive(next);
    if (!next) onParamsChange({ startFen: '', startPath: '' });
  }, [posFilterActive, onParamsChange]);

  return (
    <div>
      <div className="report-form-outer">

        { /* ── FORM FIELDS ── */}
        <div className="report-form-fields">

          <div className="report-2col-grid">
            <div className="report-2col-cell">
              <div className="report-section-title">Compte Chess.com</div>
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
            </div>
            <div className="report-2col-cell">
              <div className="report-section-title">Couleur</div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  {(['white', 'black'] as const).map((c) => (
                    <label
                      key={c}
                      className="rcolor-radio"
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        padding: 10,
                        background: params.color === c
                          ? 'linear-gradient(180deg, rgba(70,150,255,0.15), rgba(70,150,255,0.05))'
                          : 'linear-gradient(180deg, rgba(70,150,255,0.04), rgba(70,150,255,0.01))',
                        border: 'none',
                        boxShadow: params.color === c ? 'inset 0 1px 2px rgba(70,150,255,0.2)' : 'inset 0 0 0 1px rgba(148,163,184,0.12)',
                        borderRadius: 8,
                        cursor: 'pointer',
                        color: params.color === c ? '#ffffff' : '#94a3b8',
                        fontSize: '0.88rem',
                        fontWeight: 600,
                        transition: 'background 0.2s ease, box-shadow 0.2s ease',
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
            </div>
            <div style={{ gridColumn: '1 / -1', height: 14 }} />
            <div className="report-2col-cell">
              <div className="report-section-title">Filtres de parties</div>
              <div>
                <CustomSelect
                  value={params.timeClass}
                  options={[
                    { value: 'all', label: 'Toutes' },
                    { value: 'bullet', label: 'Bullet' },
                    { value: 'blitz', label: 'Blitz' },
                    { value: 'rapid', label: 'Rapide' },
                    { value: 'classical', label: 'Classique' },
                    { value: 'daily', label: 'Correspondance' },
                  ]}
                  onChange={(v) => onParamsChange({ timeClass: v as PlayerTimeClass })}
                  id="rapport-timeclass"
                />
              </div>
            </div>
            <div className="report-2col-cell">
              <div className="report-section-title">ELO adversaire</div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="number"
                    placeholder="Min"
                    min={0}
                    max={3000}
                    step={50}
                    value={params.eloMin || ''}
                    onChange={(e) => onParamsChange({ eloMin: parseInt(e.target.value) || 0 })}
                    className="rinput"
                    style={{ ...inputStyle, width: 100 }}
                  />
                  <span style={{ color: '#94a3b8', fontSize: '0.82rem' }}>—</span>
                  <input
                    type="number"
                    placeholder="Max"
                    min={0}
                    max={3000}
                    step={50}
                    value={params.eloMax === 3000 ? '' : params.eloMax}
                    onChange={(e) => onParamsChange({ eloMax: parseInt(e.target.value) || 3000 })}
                    className="rinput"
                    style={{ ...inputStyle, width: 100 }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── PÉRIODE ── */}
          <div style={{ marginBottom: 20 }} className="report-period-section">
            <div style={sectionTitleStyle}>Période (de — à)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.82rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>De</span>
              <CustomSelect
                value={params.dateFrom?.split('/')[0] || ''}
                options={years}
                onChange={(v) => {
                  const month = params.dateFrom?.split('/')[1] || '';
                  onParamsChange({ dateFrom: v ? `${v}/${month}` : '' });
                }}
                style={{ width: 100 }}
              />
              <CustomSelect
                value={params.dateFrom?.split('/')[1] || ''}
                options={MONTHS}
                onChange={(v) => {
                  const year = params.dateFrom?.split('/')[0] || '';
                  onParamsChange({ dateFrom: v ? `${year}/${v}` : '' });
                }}
                style={{ width: 80 }}
              />
              <span style={{ fontSize: '0.82rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>à</span>
              <CustomSelect
                value={params.dateTo?.split('/')[0] || String(curYear)}
                options={years}
                onChange={(v) => {
                  const month = params.dateTo?.split('/')[1] || curMonth;
                  onParamsChange({ dateTo: v ? `${v}/${month}` : '' });
                }}
                style={{ width: 100 }}
              />
              <CustomSelect
                value={params.dateTo?.split('/')[1] || curMonth}
                options={MONTHS}
                onChange={(v) => {
                  const year = params.dateTo?.split('/')[0] || String(curYear);
                  onParamsChange({ dateTo: `${year}/${v}` });
                }}
                style={{ width: 80 }}
              />
            </div>
          </div>

          {/* ── POSITION CARD — accordéon ── */}
          <div
            className={"rcard pos-filter-card" + (posFilterActive ? " pos-active" : "") + (posCardOpen ? "" : " pos-collapsed")}
            style={{
              ...cardLg,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              opacity: posFilterActive ? 1 : 0.55,
              border: 'none',
              boxShadow: posFilterActive ? 'inset 0 1px 2px rgba(70,150,255,0.2)' : 'inset 0 0 0 1px rgba(148,163,184,0.12)',
              transition: 'opacity 0.2s, box-shadow 0.2s',
            }}
          >
            <div
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', cursor: 'pointer' }}
              onClick={() => setPosCardOpen((v) => !v)}
            >
              <div className="report-section-title" style={{ marginBottom: 0, color: posFilterActive ? '#a5b4fc' : '#94a3b8' }}>
                Filtre de position
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="pos-card-chevron" style={{ fontSize: '0.7rem', color: '#94a3b8', transition: 'transform 0.2s', transform: posCardOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
                <label className="analysis-switch" style={{ margin: 0 }} onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={posFilterActive} onChange={togglePosFilter} />
                  <span className="analysis-switch-track" />
                </label>
              </div>
            </div>
            <div className="pos-card-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div style={{ pointerEvents: posFilterActive ? 'auto' : 'none' }}>
                <FenEditor color={params.color} onFenChange={handleFenChange} active={posFilterActive} />
              </div>
              <p style={{ margin: 0, fontSize: '0.72rem', color: '#94a3b8', lineHeight: 1.4 }}>
                {posFilterActive
                  ? "Jouez les coups sur l'échiquier. Le rapport ne gardera que les parties qui atteignent cette position."
                  : "Activez le filtre pour restreindre l'analyse à une position précise."}
              </p>
            </div>
          </div>

          {/* ── LANCER ── */}
          <button
            type="button"
            onClick={onSubmit}
            className="rbtn-primary"
            style={{
              ...btnPrimary,
              marginTop: 16,
              fontSize: '0.95rem',
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

        </div>{/* end form-fields */}

      </div>{/* end report-form-outer */}
    </div>
  );
});

/* ── Custom select (évite le flash blanc du <select> natif) ── */
interface SelectOption { value: string; label: string; }
const CustomSelect = React.memo(function CustomSelect({
  value, options, onChange, style, ...rest
}: {
  value: string;
  options: SelectOption[];
  onChange: (v: string) => void;
  style?: React.CSSProperties;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const selected = options.find(o => o.value === value);
  return (
    <div ref={ref} style={{ position: 'relative', ...style } as React.CSSProperties}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          background: 'rgba(15,23,42,0.92)',
          border: 'none',
          boxShadow: 'inset 0 1px 2px rgba(70,150,255,0.2)',
          borderRadius: 6,
          color: '#e2e8f0',
          padding: '9px 12px',
          fontSize: '0.88rem',
          cursor: 'pointer',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span>{selected ? selected.label : ''}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ flexShrink: 0 }}>
          <path d="M1 1l4 4 4-4" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 50,
            marginTop: 2,
            background: '#0f172a',
            border: '1px solid rgba(148,163,184,0.18)',
            borderRadius: 6,
            boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
            overflow: 'hidden',
          }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: opt.value === value ? 'rgba(99,102,241,0.15)' : 'transparent',
                border: 'none',
                color: '#e2e8f0',
                padding: '8px 12px',
                fontSize: '0.88rem',
                cursor: 'pointer',
              }}
              onPointerEnter={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.1)'; }}
              onPointerLeave={(e) => { e.currentTarget.style.background = opt.value === value ? 'rgba(99,102,241,0.15)' : 'transparent'; }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
