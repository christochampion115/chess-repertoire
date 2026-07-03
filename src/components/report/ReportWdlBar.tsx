import React from 'react';

interface ReportWdlBarProps {
  wins: number;
  draws: number;
  losses: number;
}

export const ReportWdlBar = React.memo(function ReportWdlBar({ wins, draws, losses }: ReportWdlBarProps) {
  const total = wins + draws + losses;
  if (!total) return null;
  const wPct = (wins / total * 100).toFixed(1);
  const dPct = (draws / total * 100).toFixed(1);
  const lPct = (losses / total * 100).toFixed(1);

  return (
    <div>
      <div
        style={{
          height: 6,
          display: 'flex',
          borderRadius: 100,
          overflow: 'hidden',
          marginBottom: 4,
        }}
        title={`${wPct}% V / ${dPct}% N / ${lPct}% D`}
      >
        <div style={{ width: `${wPct}%`, height: '100%', background: 'rgba(34,211,238,0.45)' }} />
        <div style={{ width: `${dPct}%`, height: '100%', background: 'rgba(148,163,184,0.2)' }} />
        <div style={{ width: `${lPct}%`, height: '100%', background: 'rgba(148,163,184,0.3)' }} />
      </div>
      <div style={{ display: 'flex', gap: 14, fontSize: '0.85rem', fontWeight: 600 }}>
        <span style={{ color: '#5eead4' }}>{wins}V</span>
        <span style={{ color: '#94a3b8' }}>{draws}N</span>
        <span style={{ color: '#94a3b8' }}>{losses}D</span>
      </div>
    </div>
  );
});
